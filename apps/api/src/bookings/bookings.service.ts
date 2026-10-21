import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { newBookingReference } from './booking-reference';

type ConfirmedPayment = {
  id: string;
  userId: string;
  reservationId: string;
  subtotalPaise: number;
  feePaise: number;
  taxPaise: number;
  amountPaise: number;
};

@Injectable()
export class BookingsService {
  // Runs inside the payment confirmation transaction. The seats must already
  // be locked and marked SOLD for this reservation.
  async createFromPayment(
    tx: Prisma.TransactionClient,
    payment: ConfirmedPayment,
    showtimeId: string,
  ) {
    const seats = await tx.reservationSeat.findMany({
      where: { reservationId: payment.reservationId },
      select: { seatId: true, category: true, pricePaise: true },
    });

    return tx.booking.create({
      data: {
        reference: newBookingReference(),
        userId: payment.userId,
        showtimeId,
        reservationId: payment.reservationId,
        paymentAttemptId: payment.id,
        subtotalPaise: payment.subtotalPaise,
        feePaise: payment.feePaise,
        taxPaise: payment.taxPaise,
        totalPaise: payment.amountPaise,
        seats: { create: seats.map((s) => ({ ...s, showtimeId })) },
        ticket: { create: {} },
      },
      select: { id: true, reference: true },
    });
  }
}
