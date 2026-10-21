import { Inject, Injectable } from '@nestjs/common';
import { seatLabels } from '../../bookings/booking.mapper';
import { formatInTimeZone } from '../../common/format';
import { PrismaService } from '../../database/prisma.service';
import { MAILER, type Mailer } from '../../notifications/mailer';
import type { OutboxHandler } from '../outbox.processor';

type Payload = { bookingId: string };

@Injectable()
export class BookingConfirmedHandler implements OutboxHandler {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async handle(payload: unknown) {
    const { bookingId } = payload as Payload;
    const booking = await this.prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
      include: {
        user: { select: { email: true, name: true } },
        seats: { include: { seat: { select: { rowLabel: true, number: true } } } },
        showtime: {
          include: {
            movie: { select: { title: true } },
            auditorium: { include: { cinema: { select: { name: true } } } },
          },
        },
      },
    });

    const { showtime } = booking;
    const seats = seatLabels(booking);

    await this.mailer.send({
      to: booking.user.email,
      subject: `Booking confirmed: ${showtime.movie.title} (${booking.reference})`,
      text: [
        `Hi ${booking.user.name},`,
        '',
        `${showtime.movie.title}`,
        `${showtime.auditorium.cinema.name}, ${showtime.auditorium.name}`,
        formatInTimeZone(showtime.startsAt),
        `Seats: ${seats.join(', ')}`,
        `Total paid: ₹${(booking.totalPaise / 100).toFixed(2)}`,
        '',
        `Show booking ${booking.reference} at the entrance.`,
      ].join('\n'),
    });
  }
}
