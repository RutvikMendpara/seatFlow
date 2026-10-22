import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth.service';
import type { Env } from '../config/env';
import { isUniqueViolation, isTransactionTimeout } from '../database/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { Prisma, ReservationStatus, type SeatCategory } from '../generated/prisma/client';
import type { CreateReservationDto } from './dto/create-reservation.dto';
import { reservationInclude, toReservationResponse } from './reservation.mapper';

type LockedSeat = {
  seat_id: string;
  status: 'AVAILABLE' | 'HELD' | 'SOLD';
  reservation_id: string | null;
  expired: boolean;
};

function seatsTaken(seatIds: string[]) {
  return new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    message: 'Some of these seats were just taken',
    unavailableSeatIds: seatIds,
  });
}

// Requests queue up behind each other's row locks on popular shows, so give
// them a little longer than Prisma's defaults before giving up.
const TX_OPTIONS = { maxWait: 5_000, timeout: 10_000 };

@Injectable()
export class ReservationsService {
  private readonly holdTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.holdTtlMs = config.get('HOLD_TTL_SECONDS', { infer: true }) * 1000;
  }

  async create(user: AuthUser, dto: CreateReservationDto, idempotencyKey?: string) {
    // Sorting gives every transaction the same lock order, which avoids deadlocks
    // between overlapping requests.
    const seatIds = [...dto.seatIds].sort();

    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(user.id, idempotencyKey);
      if (existing) return this.replay(existing, dto.showtimeId, seatIds);
    }

    // Fast path for popular shows: if a seat is plainly taken, say so without
    // opening a transaction or waiting for row locks. Most requests for a
    // contested seat end here. This is only an early answer: anything that
    // gets past it is checked again under lock in holdSeats.
    const taken = await this.prisma.$queryRaw<{ seat_id: string }[]>`
      SELECT ss.seat_id
      FROM show_seats ss
      LEFT JOIN reservations r ON r.id = ss.reservation_id
      WHERE ss.showtime_id = ${dto.showtimeId}::uuid
        AND ss.seat_id = ANY(${seatIds}::uuid[])
        AND (
          ss.status = 'SOLD'
          OR (ss.status = 'HELD' AND ss.held_until > now() AND r.user_id <> ${user.id}::uuid)
        )
    `;
    if (taken.length > 0) throw seatsTaken(taken.map((t) => t.seat_id));

    try {
      const id = await this.prisma.$transaction(
        (tx) => this.holdSeats(tx, user.id, dto.showtimeId, seatIds, idempotencyKey),
        TX_OPTIONS,
      );
      return this.findForUser(user, id);
    } catch (err) {
      if (idempotencyKey && isUniqueViolation(err, 'reservations_user_id_idempotency_key_key')) {
        // Same request sent twice at once. The other one won, so return its result.
        const existing = await this.findByIdempotencyKey(user.id, idempotencyKey);
        if (existing) return this.replay(existing, dto.showtimeId, seatIds);
      }
      if (isUniqueViolation(err, 'reservations_one_active_hold')) {
        throw new ConflictException(
          'You are already holding seats for this show in another tab. Try again.',
        );
      }
      if (isTransactionTimeout(err)) {
        throw new ServiceUnavailableException(
          'Lots of people are booking this show right now. Please try again.',
        );
      }
      throw err;
    }
  }

  private async holdSeats(
    tx: Prisma.TransactionClient,
    userId: string,
    showtimeId: string,
    seatIds: string[],
    idempotencyKey: string | undefined,
  ): Promise<string> {
    // now() is fixed for the whole transaction, so every expiry check and the
    // new hold's deadline use the same database clock.
    const [show] = await tx.$queryRaw<{ now: Date; on_sale: boolean }[]>`
      SELECT now() AS now, (status = 'SCHEDULED' AND starts_at > now()) AS on_sale
      FROM showtimes
      WHERE id = ${showtimeId}::uuid
    `;
    if (!show) throw new NotFoundException('Showtime not found');
    if (!show.on_sale) throw new ConflictException('This show is no longer taking bookings');

    // Picking seats again replaces the user's current hold on this show.
    // Lock order is always reservations first, then seats.
    const previous = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM reservations
      WHERE user_id = ${userId}::uuid
        AND showtime_id = ${showtimeId}::uuid
        AND status = 'HELD'
      FOR UPDATE
    `;
    const previousIds = previous.map((r) => r.id);

    const locked = await tx.$queryRaw<LockedSeat[]>`
      SELECT
        seat_id,
        status,
        reservation_id,
        (status = 'HELD' AND held_until <= now()) AS expired
      FROM show_seats
      WHERE showtime_id = ${showtimeId}::uuid
        AND (
          seat_id = ANY(${seatIds}::uuid[])
          OR reservation_id = ANY(${previousIds}::uuid[])
        )
      ORDER BY seat_id
      FOR UPDATE
    `;

    const requested = new Set(seatIds);
    const lockedRequested = locked.filter((s) => requested.has(s.seat_id));
    if (lockedRequested.length !== seatIds.length) {
      throw new BadRequestException('Some of these seats are not part of this show');
    }

    const unavailable = lockedRequested
      .filter(
        (s) =>
          !(
            s.status === 'AVAILABLE' ||
            (s.status === 'HELD' &&
              (s.expired || previousIds.includes(s.reservation_id ?? '')))
          ),
      )
      .map((s) => s.seat_id);
    if (unavailable.length > 0) throw seatsTaken(unavailable);

    if (previousIds.length > 0) {
      await tx.$executeRaw`
        UPDATE reservations SET status = 'CANCELLED', updated_at = now()
        WHERE id = ANY(${previousIds}::uuid[])
      `;
      await tx.$executeRaw`
        UPDATE show_seats
        SET status = 'AVAILABLE', reservation_id = NULL, held_until = NULL, updated_at = now()
        WHERE showtime_id = ${showtimeId}::uuid
          AND reservation_id = ANY(${previousIds}::uuid[])
          AND NOT (seat_id = ANY(${seatIds}::uuid[]))
      `;
    }

    // Prices always come from the database, never from the client.
    const priced = await tx.$queryRaw<
      { seat_id: string; category: SeatCategory; price_paise: number }[]
    >`
      SELECT seat.id AS seat_id, seat.category, price.price_paise
      FROM seats seat
      JOIN showtime_prices price
        ON price.showtime_id = ${showtimeId}::uuid AND price.category = seat.category
      WHERE seat.id = ANY(${seatIds}::uuid[])
    `;
    if (priced.length !== seatIds.length) {
      throw new ConflictException('Some of these seats are not on sale for this show');
    }

    const expiresAt = new Date(show.now.getTime() + this.holdTtlMs);
    const reservation = await tx.reservation.create({
      data: {
        userId,
        showtimeId,
        status: ReservationStatus.HELD,
        expiresAt,
        subtotalPaise: priced.reduce((sum, s) => sum + s.price_paise, 0),
        idempotencyKey,
        seats: {
          create: priced.map((s) => ({
            showtimeId,
            seatId: s.seat_id,
            category: s.category,
            pricePaise: s.price_paise,
          })),
        },
      },
      select: { id: true },
    });

    await tx.$executeRaw`
      UPDATE show_seats
      SET status = 'HELD', reservation_id = ${reservation.id}::uuid,
          held_until = ${expiresAt}, updated_at = now()
      WHERE showtime_id = ${showtimeId}::uuid
        AND seat_id = ANY(${seatIds}::uuid[])
    `;

    return reservation.id;
  }

  async release(user: AuthUser, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const [reservation] = await tx.$queryRaw<{ status: ReservationStatus }[]>`
        SELECT status FROM reservations
        WHERE id = ${id}::uuid AND user_id = ${user.id}::uuid
        FOR UPDATE
      `;
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (reservation.status === 'CANCELLED' || reservation.status === 'EXPIRED') return;
      if (reservation.status !== 'HELD') {
        throw new ConflictException('This reservation can no longer be released');
      }

      await tx.$executeRaw`
        UPDATE reservations SET status = 'CANCELLED', updated_at = now()
        WHERE id = ${id}::uuid
      `;
      // Only seats still pointing at this reservation. Seats from an expired
      // hold may already belong to someone else.
      await tx.$executeRaw`
        UPDATE show_seats
        SET status = 'AVAILABLE', reservation_id = NULL, held_until = NULL, updated_at = now()
        WHERE reservation_id = ${id}::uuid AND status = 'HELD'
      `;
    }, TX_OPTIONS);
  }

  async findForUser(user: AuthUser, id: string) {
    const [reservation, now] = await Promise.all([
      this.prisma.reservation.findFirst({
        where: { id, userId: user.id },
        include: reservationInclude,
      }),
      this.dbNow(),
    ]);
    // 404 rather than 403 so ids of other people's reservations aren't confirmed.
    if (!reservation) throw new NotFoundException('Reservation not found');
    return toReservationResponse(reservation, now);
  }

  private findByIdempotencyKey(userId: string, idempotencyKey: string) {
    return this.prisma.reservation.findUnique({
      where: { userId_idempotencyKey: { userId, idempotencyKey } },
      include: reservationInclude,
    });
  }

  private async replay(
    existing: NonNullable<Awaited<ReturnType<ReservationsService['findByIdempotencyKey']>>>,
    showtimeId: string,
    seatIds: string[],
  ) {
    const sameSeats =
      existing.seats.map((s) => s.seatId).sort().join() === seatIds.join();
    if (existing.showtimeId !== showtimeId || !sameSeats) {
      throw new UnprocessableEntityException(
        'This idempotency key was already used for a different request',
      );
    }
    return toReservationResponse(existing, await this.dbNow());
  }

  private async dbNow() {
    const [row] = await this.prisma.$queryRaw<{ now: Date }[]>`SELECT now() AS now`;
    return row!.now;
  }
}
