import { Injectable, Logger } from '@nestjs/common';
import { BookingsService } from '../bookings/bookings.service';
import { PrismaService } from '../database/prisma.service';
import { PaymentStatus, Prisma, ReservationStatus } from '../generated/prisma/client';
import { OutboxService } from '../outbox/outbox.service';

export type SucceededPayment = {
  orderId: string;
  reference: string;
  paymentId: string;
  amountPaise: number;
  currency: string;
};

export type FailedPayment = {
  orderId: string;
  reference: string;
  reason: string | null;
};

export type Outcome =
  | 'confirmed'
  | 'refund_required'
  | 'failed'
  | 'already_handled'
  | 'unknown_order';

type LockedAttempt = {
  id: string;
  status: PaymentStatus;
  currency: string;
  reservation_id: string;
  amount_paise: number;
};

type LockedSeat = {
  seat_id: string;
  status: 'AVAILABLE' | 'HELD' | 'SOLD';
  reservation_id: string | null;
  expired: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SETTLED: PaymentStatus[] = [
  PaymentStatus.SUCCEEDED,
  PaymentStatus.REFUND_PENDING,
  PaymentStatus.REFUNDED,
];

// Turns what the provider says about a payment into booking state. Called
// from webhooks and from reconciliation, so every method here must be safe
// to run more than once for the same payment.
//
// Lock order matches the rest of the app: payment attempt, then
// reservation, then seats sorted by id.
@Injectable()
export class PaymentOutcomesService {
  private readonly logger = new Logger(PaymentOutcomesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bookings: BookingsService,
    private readonly outbox: OutboxService,
  ) {}

  async succeeded(tx: Prisma.TransactionClient, event: SucceededPayment): Promise<Outcome> {
    const attempt = await this.lockAttempt(tx, event.orderId, event.reference);
    if (!attempt) {
      this.logger.warn(`Payment for unknown order ${event.orderId}`);
      return 'unknown_order';
    }
    if (SETTLED.includes(attempt.status)) return 'already_handled';

    if (event.amountPaise !== attempt.amount_paise || event.currency !== attempt.currency) {
      this.logger.error(
        `Payment ${attempt.id} charged ${event.amountPaise} ${event.currency}, ` +
          `expected ${attempt.amount_paise} ${attempt.currency}`,
      );
      return this.requireRefund(tx, attempt.id, event, 'amount_mismatch');
    }

    const [reservation] = await tx.$queryRaw<
      { status: ReservationStatus; showtime_id: string; show_upcoming: boolean }[]
    >`
      SELECT r.status, r.showtime_id, s.starts_at > now() AS show_upcoming
      FROM reservations r
      JOIN showtimes s ON s.id = r.showtime_id
      WHERE r.id = ${attempt.reservation_id}::uuid
      FOR UPDATE OF r
    `;
    if (!reservation) throw new Error(`Reservation ${attempt.reservation_id} is missing`);

    if (reservation.status === ReservationStatus.CONFIRMED) {
      // Paid twice, e.g. from two tabs. The first payment got the seats.
      return this.requireRefund(tx, attempt.id, event, 'already_confirmed');
    }
    if (!reservation.show_upcoming) {
      return this.requireRefund(tx, attempt.id, event, 'show_started', attempt.reservation_id);
    }

    const seats = await tx.$queryRaw<LockedSeat[]>`
      SELECT seat_id, status, reservation_id, (status = 'HELD' AND held_until <= now()) AS expired
      FROM show_seats
      WHERE showtime_id = ${reservation.showtime_id}::uuid
        AND seat_id IN (
          SELECT seat_id FROM reservation_seats WHERE reservation_id = ${attempt.reservation_id}::uuid
        )
      ORDER BY seat_id
      FOR UPDATE
    `;

    // A late payment can still go through if nobody else has taken the seats,
    // even though our hold on them has run out.
    const stillOurs = seats.every(
      (s) =>
        s.status === 'AVAILABLE' ||
        (s.status === 'HELD' && (s.reservation_id === attempt.reservation_id || s.expired)),
    );
    if (!stillOurs) {
      return this.requireRefund(
        tx,
        attempt.id,
        event,
        'seats_unavailable',
        attempt.reservation_id,
      );
    }

    await tx.$executeRaw`
      UPDATE show_seats
      SET status = 'SOLD', reservation_id = ${attempt.reservation_id}::uuid,
          held_until = NULL, updated_at = now()
      WHERE showtime_id = ${reservation.showtime_id}::uuid
        AND seat_id = ANY(${seats.map((s) => s.seat_id)}::uuid[])
    `;
    await tx.reservation.update({
      where: { id: attempt.reservation_id },
      data: { status: ReservationStatus.CONFIRMED },
    });
    const payment = await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentStatus.SUCCEEDED,
        providerOrderId: event.orderId,
        providerPaymentId: event.paymentId,
        failureReason: null,
      },
    });

    const booking = await this.bookings.createFromPayment(tx, payment, reservation.showtime_id);
    await this.outbox.enqueue(tx, {
      type: 'booking.confirmed',
      payload: { bookingId: booking.id },
    });
    this.logger.log(`Payment ${attempt.id} confirmed booking ${booking.reference}`);
    return 'confirmed';
  }

  async failed(tx: Prisma.TransactionClient, event: FailedPayment): Promise<Outcome> {
    const attempt = await this.lockAttempt(tx, event.orderId, event.reference);
    if (!attempt) return 'unknown_order';
    if (attempt.status !== PaymentStatus.CREATED && attempt.status !== PaymentStatus.PENDING) {
      return 'already_handled';
    }

    // The reservation stays in PAYMENT_PENDING, so the user can try another
    // payment until the deadline.
    await tx.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentStatus.FAILED,
        providerOrderId: event.orderId,
        failureReason: event.reason ?? 'failed',
      },
    });
    return 'failed';
  }

  // Money was taken but we can't give the customer the seats, so it has to go
  // back. The refund itself happens in the worker through the outbox.
  private async requireRefund(
    tx: Prisma.TransactionClient,
    attemptId: string,
    event: SucceededPayment,
    reason: string,
    releaseReservationId?: string,
  ): Promise<Outcome> {
    await tx.paymentAttempt.update({
      where: { id: attemptId },
      data: {
        status: PaymentStatus.REFUND_PENDING,
        providerOrderId: event.orderId,
        providerPaymentId: event.paymentId,
        failureReason: reason,
      },
    });

    if (releaseReservationId) {
      await tx.reservation.update({
        where: { id: releaseReservationId },
        data: { status: ReservationStatus.EXPIRED },
      });
      await tx.$executeRaw`
        UPDATE show_seats
        SET status = 'AVAILABLE', reservation_id = NULL, held_until = NULL, updated_at = now()
        WHERE reservation_id = ${releaseReservationId}::uuid AND status = 'HELD'
      `;
    }

    await this.outbox.enqueue(tx, {
      type: 'payment.refund_requested',
      payload: { paymentAttemptId: attemptId, amountPaise: event.amountPaise },
    });
    this.logger.warn(`Payment ${attemptId} needs a refund: ${reason}`);
    return 'refund_required';
  }

  // Finds the attempt by provider order id. Falls back to our own id (sent as
  // the order reference), for the case where the order was created but we
  // never got to store its id.
  private async lockAttempt(tx: Prisma.TransactionClient, orderId: string, reference: string) {
    const byReference = UUID.test(reference) ? reference : null;
    const [attempt] = await tx.$queryRaw<LockedAttempt[]>`
      SELECT id, status, currency, reservation_id, amount_paise
      FROM payment_attempts
      WHERE provider_order_id = ${orderId}
         OR (id = ${byReference}::uuid AND provider_order_id IS NULL)
      LIMIT 1
      FOR UPDATE
    `;
    return attempt;
  }

  // Convenience for callers that aren't already in a transaction.
  run<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(fn, { maxWait: 5_000, timeout: 10_000 });
  }
}
