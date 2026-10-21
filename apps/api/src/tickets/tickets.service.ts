import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { seatLabels } from '../bookings/booking.mapper';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import type { CheckInDto } from './dto/check-in.dto';
import { verifyTicket } from './ticket-token';

// Gates open an hour before the show and close when it ends.
const ENTRY_OPENS_MINUTES_BEFORE = 60;

export type CheckInResult =
  | 'admitted'
  | 'already_checked_in'
  | 'invalid'
  | 'wrong_cinema'
  | 'too_early'
  | 'show_over';

@Injectable()
export class TicketsService {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('TICKET_SIGNING_SECRET', { infer: true });
  }

  async checkIn(dto: CheckInDto) {
    const ticketId = verifyTicket(dto.token, this.secret);
    if (!ticketId) return { result: 'invalid' as CheckInResult };

    const ticket = await this.prisma.ticket.findUnique({
      where: { id: ticketId },
      include: {
        booking: {
          include: {
            seats: { include: { seat: { select: { rowLabel: true, number: true } } } },
            showtime: {
              include: {
                movie: { select: { title: true } },
                auditorium: { include: { cinema: { select: { slug: true, name: true } } } },
              },
            },
          },
        },
      },
    });
    if (!ticket) return { result: 'invalid' as CheckInResult };

    const { booking } = ticket;
    const { showtime } = booking;
    const details = {
      reference: booking.reference,
      movie: showtime.movie.title,
      cinema: showtime.auditorium.cinema.name,
      auditorium: showtime.auditorium.name,
      startsAt: showtime.startsAt,
      seats: seatLabels(booking),
    };

    if (dto.cinema && dto.cinema !== showtime.auditorium.cinema.slug) {
      return { result: 'wrong_cinema' as CheckInResult, ...details };
    }

    // Conditional update, so two gates scanning the same ticket at the same
    // moment can't both let it in. The entry window is checked against the
    // database clock too.
    const [row] = await this.prisma.$queryRaw<{ result: CheckInResult; checked_in_at: Date | null }[]>`
      WITH show AS (
        SELECT
          now() < starts_at - make_interval(mins => ${ENTRY_OPENS_MINUTES_BEFORE}) AS too_early,
          now() > ends_at AS show_over
        FROM showtimes WHERE id = ${showtime.id}::uuid
      ),
      admitted AS (
        UPDATE tickets SET checked_in_at = now()
        WHERE id = ${ticketId}::uuid
          AND checked_in_at IS NULL
          AND NOT (SELECT too_early OR show_over FROM show)
        RETURNING checked_in_at
      )
      SELECT
        CASE
          WHEN EXISTS (SELECT 1 FROM admitted) THEN 'admitted'
          WHEN (SELECT too_early FROM show) THEN 'too_early'
          WHEN (SELECT show_over FROM show) THEN 'show_over'
          ELSE 'already_checked_in'
        END AS result,
        COALESCE((SELECT checked_in_at FROM admitted), t.checked_in_at) AS checked_in_at
      FROM tickets t WHERE t.id = ${ticketId}::uuid
    `;

    return { result: row!.result, checkedInAt: row!.checked_in_at, ...details };
  }
}
