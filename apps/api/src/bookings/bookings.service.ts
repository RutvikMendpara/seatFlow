import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import QRCode from 'qrcode';
import type { AuthUser } from '../auth/auth.service';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { signTicket } from '../tickets/ticket-token';
import { bookingInclude, toBookingResponse } from './booking.mapper';
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
  private readonly ticketSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ticketSecret = config.get('TICKET_SIGNING_SECRET', { infer: true });
  }

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

  async listForUser(user: AuthUser) {
    const bookings = await this.prisma.booking.findMany({
      where: { userId: user.id },
      include: bookingInclude,
      orderBy: { showtime: { startsAt: 'desc' } },
    });
    return bookings.map(toBookingResponse);
  }

  async findForUser(user: AuthUser, reference: string) {
    const booking = await this.find(user, reference);
    return {
      ...toBookingResponse(booking),
      ticket: booking.ticket && {
        token: signTicket(booking.ticket.id, this.ticketSecret),
        issuedAt: booking.ticket.issuedAt,
        checkedInAt: booking.ticket.checkedInAt,
      },
    };
  }

  async ticketQrSvg(user: AuthUser, reference: string) {
    const booking = await this.find(user, reference);
    if (!booking.ticket) throw new NotFoundException('Ticket not found');
    return QRCode.toString(signTicket(booking.ticket.id, this.ticketSecret), {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 2,
    });
  }

  private async find(user: AuthUser, reference: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { reference, userId: user.id },
      include: bookingInclude,
    });
    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }
}
