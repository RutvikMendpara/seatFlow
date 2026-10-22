import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CheckoutPanel } from '@/components/checkout-panel';
import { PriceSummary } from '@/components/price-summary';
import { ShowSummary } from '@/components/show-summary';
import { apiGet } from '@/lib/api';
import { requireUser } from '@/lib/session';
import type { Reservation, ShowtimeDetail } from '@/lib/types';

export const metadata: Metadata = { title: 'Checkout' };

type Props = { params: Promise<{ id: string }> };

export default async function CheckoutPage({ params }: Props) {
  const { id } = await params;
  await requireUser(`/checkout/${id}`);
  const reservation = await apiGet<Reservation>(`/reservations/${id}`);
  if (reservation.bookingReference) redirect(`/bookings/${reservation.bookingReference}`);
  const show = await apiGet<ShowtimeDetail>(`/showtimes/${reservation.showtimeId}`);

  const ended = reservation.status === 'EXPIRED' || reservation.status === 'CANCELLED';

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Review and pay</h1>
      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
        <section aria-labelledby="booking-summary" className="space-y-5 rounded-xl border border-line bg-surface p-5">
          <h2 id="booking-summary" className="sr-only">
            Booking summary
          </h2>
          <ShowSummary show={show} seats={reservation.seats.map((s) => s.label)} />
          <PriceSummary seats={reservation.seats} price={reservation.price} />
        </section>

        <section aria-label="Payment">
          {ended ? (
            <div className="rounded-xl border border-line bg-surface p-5" role="alert">
              <p className="font-semibold">
                {reservation.status === 'CANCELLED' ? 'You released these seats' : 'Your seats have been released'}
              </p>
              <Link
                href={`/showtimes/${reservation.showtimeId}`}
                className="mt-4 inline-flex h-11 items-center rounded-lg bg-accent px-5 font-medium text-accent-ink hover:bg-accent-strong"
              >
                Pick seats again
              </Link>
            </div>
          ) : (
            <CheckoutPanel reservation={reservation} />
          )}
        </section>
      </div>
    </div>
  );
}
