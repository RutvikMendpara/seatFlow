import type { Metadata } from 'next';
import Link from 'next/link';
import { PrintButton } from '@/components/print-button';
import { apiGet } from '@/lib/api';
import {
  certificateLabel,
  formatPrice,
  formatShowDate,
  formatTime,
  showFormatLabel,
} from '@/lib/format';
import { param, type SearchParams } from '@/lib/search-params';
import { requireUser } from '@/lib/session';
import type { BookingWithTicket } from '@/lib/types';

type Props = { params: Promise<{ reference: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { reference } = await params;
  return { title: `Ticket ${reference}` };
}

export default async function TicketPage({ params, searchParams }: Props) {
  const { reference } = await params;
  const justBooked = param((await searchParams).new) === '1';
  await requireUser(`/bookings/${reference}`);
  const booking = await apiGet<BookingWithTicket>(`/bookings/${encodeURIComponent(reference)}`);

  return (
    <div className="mx-auto max-w-md">
      {justBooked && (
        <div role="status" className="mb-6 rounded-xl bg-success-soft p-4 text-success print:hidden">
          <p className="font-semibold">You&apos;re all set!</p>
          <p className="text-sm">We&apos;ve emailed your confirmation. Show this ticket at the entrance.</p>
        </div>
      )}

      <article
        aria-labelledby="ticket-title"
        className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm print:shadow-none"
      >
        <div className="bg-ink px-5 py-4 text-white">
          <p className="text-xs tracking-widest uppercase opacity-70">SeatFlow ticket</p>
          <h1 id="ticket-title" className="mt-1 text-xl font-bold">
            {booking.movie.title}
          </h1>
          <p className="text-sm opacity-80">
            {certificateLabel(booking.movie.certificate)} · {booking.language} ·{' '}
            {showFormatLabel(booking.format)}
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-4 px-5 py-4 text-sm">
          <div>
            <dt className="text-ink-subtle">Date</dt>
            <dd className="font-medium">{formatShowDate(booking.startsAt)}</dd>
          </div>
          <div>
            <dt className="text-ink-subtle">Time</dt>
            <dd className="font-medium">{formatTime(booking.startsAt)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-subtle">Cinema</dt>
            <dd className="font-medium">
              {booking.cinema.name}, {booking.auditorium}
            </dd>
            <dd className="text-ink-muted">{booking.cinema.address}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-subtle">Seats</dt>
            <dd className="text-lg font-semibold">{booking.seats.join(', ')}</dd>
          </div>
        </dl>

        <div className="border-t border-dashed border-line-strong px-5 py-5 text-center">
          {booking.ticket ? (
            <>
              {/* Served by the API through the /api proxy, so the session cookie is sent. */}
              <img
                src={`/api/bookings/${encodeURIComponent(booking.reference)}/ticket.svg`}
                alt={`QR code for booking ${booking.reference}`}
                width={200}
                height={200}
                className="mx-auto"
              />
              <p className="mt-2 font-mono text-lg font-semibold tracking-wider">{booking.reference}</p>
              {booking.ticket.checkedInAt ? (
                <p className="mt-1 text-sm font-medium text-success">
                  Checked in at {formatTime(booking.ticket.checkedInAt)}
                </p>
              ) : (
                <p className="mt-1 text-sm text-ink-muted">Gates open an hour before the show.</p>
              )}
            </>
          ) : (
            <p className="text-ink-muted">Your ticket is being prepared.</p>
          )}
        </div>

        <div className="border-t border-line px-5 py-4 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">Tickets</span>
            <span>{formatPrice(booking.subtotalPaise)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Fee and GST</span>
            <span>{formatPrice(booking.feePaise + booking.taxPaise)}</span>
          </div>
          <div className="mt-1 flex justify-between font-semibold">
            <span>Paid</span>
            <span>{formatPrice(booking.totalPaise)}</span>
          </div>
        </div>
      </article>

      <div className="mt-6 flex items-center justify-between print:hidden">
        <Link href="/bookings" className="text-sm font-medium text-accent-strong hover:underline">
          ← All bookings
        </Link>
        <PrintButton />
      </div>
    </div>
  );
}
