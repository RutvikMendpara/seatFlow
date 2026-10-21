import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthUser } from '../auth/auth.service';
import type { Env } from '../config/env';
import { isUniqueViolation } from '../database/prisma-errors';
import { PrismaService } from '../database/prisma.service';
import { PaymentStatus, Prisma, ReservationStatus } from '../generated/prisma/client';
import {
  PAYMENT_GATEWAY,
  PaymentProviderError,
  type PaymentGateway,
} from './gateway/payment-gateway';
import { toPaymentResponse } from './payment.mapper';
import { priceBooking } from './pricing';

@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly paymentWindowMs: number;
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    config: ConfigService<Env, true>,
  ) {
    this.paymentWindowMs = config.get('PAYMENT_WINDOW_SECONDS', { infer: true }) * 1000;
    this.webUrl = config.get('WEB_URL', { infer: true });
  }

  async startCheckout(user: AuthUser, reservationId: string) {
    let attempt;
    try {
      attempt = await this.prisma.$transaction((tx) =>
        this.recordAttempt(tx, user.id, reservationId),
      );
    } catch (err) {
      // Two clicks raced and both got past the "already in flight" check.
      // The other one created the attempt, so use it.
      if (!isUniqueViolation(err, 'payment_attempts_one_active')) throw err;
      attempt = await this.prisma.paymentAttempt.findFirstOrThrow({
        where: { reservationId, status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] } },
        include: { reservation: { select: { expiresAt: true } } },
      });
    }

    if (attempt.status === PaymentStatus.PENDING) return toPaymentResponse(attempt);

    // The provider call happens after the transaction commits, so a slow
    // provider never holds seat locks. If it fails, the attempt stays CREATED
    // and the next try reuses it. The attempt id is the idempotency key, so
    // the provider won't open a second order.
    let order;
    try {
      order = await this.gateway.createOrder(
        {
          amountPaise: attempt.amountPaise,
          currency: attempt.currency,
          reference: attempt.id,
          expiresAt: attempt.reservation.expiresAt,
          returnUrl: `${this.webUrl}/payments/${attempt.id}`,
        },
        attempt.id,
      );
    } catch (err) {
      if (!(err instanceof PaymentProviderError)) throw err;
      this.logger.warn(`Creating order for payment ${attempt.id} failed: ${err.message}`);
      throw new BadGatewayException(
        'The payment provider is not responding. Your seats are still held, please try again.',
      );
    }

    const updated = await this.prisma.paymentAttempt.update({
      where: { id: attempt.id },
      data: {
        status: PaymentStatus.PENDING,
        providerOrderId: order.id,
        checkoutUrl: order.checkoutUrl,
      },
    });
    return toPaymentResponse(updated);
  }

  private async recordAttempt(
    tx: Prisma.TransactionClient,
    userId: string,
    reservationId: string,
  ) {
    const [reservation] = await tx.$queryRaw<
      { status: ReservationStatus; expires_at: Date; now: Date }[]
    >`
      SELECT status, expires_at, now() AS now FROM reservations
      WHERE id = ${reservationId}::uuid AND user_id = ${userId}::uuid
      FOR UPDATE
    `;
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.status === ReservationStatus.CONFIRMED) {
      throw new ConflictException('These seats are already booked');
    }
    const live =
      (reservation.status === ReservationStatus.HELD ||
        reservation.status === ReservationStatus.PAYMENT_PENDING) &&
      reservation.expires_at > reservation.now;
    if (!live) {
      throw new ConflictException('Your seats were released. Please pick them again.');
    }

    // A second click on "Pay" gets the payment that's already in flight.
    const inFlight = await tx.paymentAttempt.findFirst({
      where: { reservationId, status: { in: [PaymentStatus.CREATED, PaymentStatus.PENDING] } },
      include: { reservation: { select: { expiresAt: true } } },
    });
    if (inFlight) return inFlight;

    // Going to pay extends the hold once. Retrying after a failed payment
    // doesn't extend it again, so a hold can't be kept alive forever.
    if (reservation.status === ReservationStatus.HELD) {
      const deadline = new Date(reservation.now.getTime() + this.paymentWindowMs);
      await tx.reservation.update({
        where: { id: reservationId },
        data: { status: ReservationStatus.PAYMENT_PENDING, expiresAt: deadline },
      });
      await tx.$executeRaw`
        UPDATE show_seats SET held_until = ${deadline}, updated_at = now()
        WHERE reservation_id = ${reservationId}::uuid AND status = 'HELD'
      `;
    }

    const seats = await tx.reservationSeat.findMany({
      where: { reservationId },
      select: { pricePaise: true },
    });
    return tx.paymentAttempt.create({
      data: { reservationId, userId, ...priceBooking(seats.map((s) => s.pricePaise)) },
      include: { reservation: { select: { expiresAt: true } } },
    });
  }

  async findForUser(user: AuthUser, paymentId: string) {
    const payment = await this.prisma.paymentAttempt.findFirst({
      where: { id: paymentId, userId: user.id },
      include: { booking: { select: { reference: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return toPaymentResponse(payment, payment.booking?.reference ?? null);
  }
}
