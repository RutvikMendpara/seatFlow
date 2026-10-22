'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatCountdown, useCountdown } from '@/hooks/use-countdown';
import { callApi } from '@/lib/client-api';
import type { Payment, Reservation } from '@/lib/types';

// Announced to screen readers when the timer passes these points, rather
// than every second.
const WARNINGS = [120, 30];

export function CheckoutPanel({ reservation }: { reservation: Reservation }) {
  const router = useRouter();
  const seconds = useCountdown(reservation.expiresAt, reservation.serverTime);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState('');
  const expired = seconds === 0;
  const inPayment = reservation.status === 'PAYMENT_PENDING';
  const lastFailed = reservation.latestPayment?.status === 'FAILED';

  useEffect(() => {
    if (WARNINGS.includes(seconds)) {
      setWarning(`${formatCountdown(seconds)} left to complete your booking.`);
    }
  }, [seconds]);

  async function pay() {
    setPending(true);
    setError(null);
    const res = await callApi<Payment>(`/reservations/${reservation.id}/checkout`, { method: 'POST' });
    if (res.ok && res.data.checkoutUrl) {
      window.location.assign(res.data.checkoutUrl);
      return;
    }
    setPending(false);
    setError(res.ok ? 'Could not start the payment. Please try again.' : res.message);
    if (!res.ok && res.status === 409) router.refresh();
  }

  async function changeSeats() {
    setPending(true);
    await callApi(`/reservations/${reservation.id}`, { method: 'DELETE' });
    const seats = reservation.seats.map((s) => s.id).join(',');
    router.push(`/showtimes/${reservation.showtimeId}?seats=${seats}`);
  }

  if (expired) {
    return (
      <div className="rounded-xl border border-line bg-surface p-5" role="alert">
        <p className="font-semibold">Your seats have been released</p>
        <p className="mt-1 text-sm text-ink-muted">
          The hold ran out before payment finished. If you were charged, it will be refunded
          automatically.
        </p>
        <Link
          href={`/showtimes/${reservation.showtimeId}`}
          className="mt-4 inline-flex h-11 items-center rounded-lg bg-accent px-5 font-medium text-accent-ink hover:bg-accent-strong"
        >
          Pick seats again
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        className={`flex items-center justify-between rounded-xl px-4 py-3 ${
          seconds <= 120 ? 'bg-accent-soft text-accent-strong' : 'bg-success-soft text-success'
        }`}
      >
        <span className="text-sm font-medium">Seats held for you</span>
        <span role="timer" aria-label="Time left" className="font-mono text-lg font-semibold tabular-nums">
          {formatCountdown(seconds)}
        </span>
      </div>
      <p className="sr-only" aria-live="assertive">
        {warning}
      </p>

      {lastFailed && !error && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong" role="status">
          Your last payment didn&apos;t go through. You can try again before the timer runs out.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={pending}
        className="h-12 w-full rounded-lg bg-accent text-base font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? 'Opening payment…' : inPayment && !lastFailed ? 'Continue to payment' : 'Pay now'}
      </button>
      {!inPayment && (
        <button
          type="button"
          onClick={changeSeats}
          disabled={pending}
          className="h-11 w-full rounded-lg border border-line-strong font-medium hover:bg-canvas disabled:opacity-60"
        >
          Change seats
        </button>
      )}
      <p className="text-center text-xs text-ink-subtle">
        You&apos;ll be taken to our payment partner&apos;s secure page.
      </p>
    </div>
  );
}
