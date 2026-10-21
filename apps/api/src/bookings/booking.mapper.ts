import type { Prisma } from '../generated/prisma/client';

export const bookingInclude = {
  seats: { include: { seat: { select: { rowLabel: true, number: true } } } },
  ticket: true,
  showtime: {
    include: {
      movie: { select: { slug: true, title: true, certificate: true } },
      auditorium: { include: { cinema: { select: { slug: true, name: true, address: true } } } },
    },
  },
} satisfies Prisma.BookingInclude;

type BookingWithDetails = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export function seatLabels(booking: Pick<BookingWithDetails, 'seats'>) {
  return booking.seats
    .map((s) => `${s.seat.rowLabel}${s.seat.number}`)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

export function toBookingResponse(booking: BookingWithDetails) {
  const { showtime } = booking;
  return {
    reference: booking.reference,
    createdAt: booking.createdAt,
    movie: showtime.movie,
    cinema: showtime.auditorium.cinema,
    auditorium: showtime.auditorium.name,
    startsAt: showtime.startsAt,
    language: showtime.language,
    format: showtime.format,
    seats: seatLabels(booking),
    subtotalPaise: booking.subtotalPaise,
    feePaise: booking.feePaise,
    taxPaise: booking.taxPaise,
    totalPaise: booking.totalPaise,
    checkedInAt: booking.ticket?.checkedInAt ?? null,
  };
}
