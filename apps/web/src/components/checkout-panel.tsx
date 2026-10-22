'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { changeSeats } from '@/app/checkout/actions';
import { formatCountdown, useCountdown } from '@/hooks/use-countdown';
import type { Reservation } from '@/lib/types';
import { PayButton } from './pay-button';

// Announced to screen readers when the timer passes these points, rather
// than every second.
const WARNINGS = [120, 30];

export function CheckoutPanel({ reservation }: { reservation: Reservation }) {
  const seconds = useCountdown(reservation.expiresAt, reservation.serverTime);
  const [warning, setWarning] = useState('');
  const expired = seconds === 0;
  const inPayment = reservation.status === 'PAYMENT_PENDING';
  const lastFailed = reservation.latestPayment?.status === 'FAILED';

  useEffect(() => {
    if (WARNINGS.includes(seconds)) {
      setWarning(`${formatCountdown(seconds)} left to complete your booking.`);
    }
  }, [seconds]);

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

      {lastFailed && (
        <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong" role="status">
          Your last payment didn&apos;t go through. You can try again before the timer runs out.
        </p>
      )}

      <PayButton
        reservationId={reservation.id}
        label={inPayment && !lastFailed ? 'Continue to payment' : 'Pay now'}
      />
      {!inPayment && (
        <form action={changeSeats}>
          <input type="hidden" name="reservationId" value={reservation.id} />
          <input type="hidden" name="showtimeId" value={reservation.showtimeId} />
          <input type="hidden" name="seats" value={reservation.seats.map((s) => s.id).join(',')} />
          <button
            type="submit"
            className="h-11 w-full rounded-lg border border-line-strong font-medium hover:bg-canvas"
          >
            Change seats
          </button>
        </form>
      )}
      <p className="text-center text-xs text-ink-subtle">
        You&apos;ll be taken to our payment partner&apos;s secure page.
      </p>
    </div>
  );
}
