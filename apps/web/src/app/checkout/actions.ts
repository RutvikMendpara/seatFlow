'use server';

import { redirect } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import type { Payment } from '@/lib/types';

export type StartPaymentState = { error: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A form action rather than a click handler, so Pay works before the page
// has hydrated (or without JavaScript at all). A click on a button that
// hasn't hydrated yet would otherwise do nothing.
export async function startPayment(
  _previous: StartPaymentState,
  form: FormData,
): Promise<StartPaymentState> {
  const reservationId = form.get('reservationId');
  if (typeof reservationId !== 'string' || !UUID.test(reservationId)) {
    return { error: 'Something went wrong. Please reload the page.' };
  }

  const res = await apiFetch(`/reservations/${reservationId}/checkout`, {}, { method: 'POST' });
  if (res.status === 401) redirect(`/login?next=${encodeURIComponent(`/checkout/${reservationId}`)}`);

  const body = (await res.json().catch(() => ({}))) as Partial<Payment> & { message?: string };
  if (res.ok && body.checkoutUrl) redirect(body.checkoutUrl);
  return { error: body.message ?? 'Could not start the payment. Please try again.' };
}

// Lets go of the hold and goes back to the seat map with the same seats
// picked, so they can be changed.
export async function changeSeats(form: FormData) {
  const reservationId = form.get('reservationId');
  const showtimeId = form.get('showtimeId');
  const seats = form.get('seats');
  if (
    typeof reservationId !== 'string' ||
    !UUID.test(reservationId) ||
    typeof showtimeId !== 'string' ||
    !UUID.test(showtimeId)
  ) {
    redirect('/');
  }
  await apiFetch(`/reservations/${reservationId}`, {}, { method: 'DELETE' });
  const picked = typeof seats === 'string' ? `?seats=${encodeURIComponent(seats)}` : '';
  redirect(`/showtimes/${showtimeId}${picked}`);
}
