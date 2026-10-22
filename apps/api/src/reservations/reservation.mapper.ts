import type { PaymentStatus, ReservationStatus, SeatCategory } from '../generated/prisma/client';
import { priceBooking } from '../payments/pricing';

type ReservationWithSeats = {
  id: string;
  showtimeId: string;
  status: ReservationStatus;
  expiresAt: Date;
  subtotalPaise: number;
  seats: {
    seatId: string;
    category: SeatCategory;
    pricePaise: number;
    seat: { rowLabel: string; number: number };
  }[];
  payments: { id: string; status: PaymentStatus; failureReason: string | null }[];
  booking: { reference: string } | null;
};

// A hold past its expiry is expired even if the cleanup job hasn't marked it yet.
export function effectiveStatus(status: ReservationStatus, expiresAt: Date, now: Date) {
  return status === 'HELD' && expiresAt <= now ? 'EXPIRED' : status;
}

export function toReservationResponse(reservation: ReservationWithSeats, now: Date) {
  return {
    id: reservation.id,
    showtimeId: reservation.showtimeId,
    status: effectiveStatus(reservation.status, reservation.expiresAt, now),
    expiresAt: reservation.expiresAt,
    // Lets the client correct for its own clock when showing the countdown.
    serverTime: now,
    subtotalPaise: reservation.subtotalPaise,
    // What checkout will charge. Shown before paying; checkout recomputes it.
    price: priceBooking(reservation.seats.map((s) => s.pricePaise)),
    latestPayment: reservation.payments[0] ?? null,
    bookingReference: reservation.booking?.reference ?? null,
    seats: reservation.seats
      .map((s) => ({
        id: s.seatId,
        label: `${s.seat.rowLabel}${s.seat.number}`,
        category: s.category,
        pricePaise: s.pricePaise,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true })),
  };
}

export const reservationInclude = {
  seats: { include: { seat: { select: { rowLabel: true, number: true } } } },
  payments: {
    select: { id: true, status: true, failureReason: true },
    orderBy: { createdAt: 'desc' },
    take: 1,
  },
  booking: { select: { reference: true } },
} as const;
