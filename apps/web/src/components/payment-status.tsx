'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { callApi } from '@/lib/client-api';
import { formatPrice } from '@/lib/format';
import type { Payment } from '@/lib/types';

const POLL_MS = 1_500;
// After this long, stop polling and tell the user we'll follow up.
const GIVE_UP_AFTER_MS = 90_000;

const FAILURE_MESSAGES: Record<string, string> = {
  card_declined: 'Your bank declined the payment.',
  cancelled_by_customer: 'The payment was cancelled.',
  expired: 'The payment page timed out.',
};

const REFUND_MESSAGES: Record<string, string> = {
  seats_unavailable: 'Your payment arrived after the hold ran out, and the seats had already gone to someone else.',
  already_confirmed: 'These seats were already paid for in another payment.',
  show_started: 'The payment arrived after the show had started.',
  amount_mismatch: 'The amount charged did not match your booking.',
};

export function PaymentStatus({ initial }: { initial: Payment }) {
  const router = useRouter();
  const [payment, setPayment] = useState(initial);
  const [gaveUp, setGaveUp] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const waiting = payment.status === 'PENDING' || payment.status === 'CREATED';

  useEffect(() => {
    if (payment.status === 'SUCCEEDED' && payment.bookingReference) {
      router.replace(`/bookings/${payment.bookingReference}?new=1`);
    }
  }, [payment, router]);

  useEffect(() => {
    if (!waiting || gaveUp) return;
    const started = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - started > GIVE_UP_AFTER_MS) {
        setGaveUp(true);
        clearInterval(timer);
        return;
      }
      const res = await callApi<Payment>(`/payments/${payment.id}`);
      if (res.ok) setPayment(res.data);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, gaveUp, payment.id]);

  async function tryAgain() {
    setRetrying(true);
    setRetryError(null);
    const res = await callApi<Payment>(`/reservations/${payment.reservationId}/checkout`, {
      method: 'POST',
    });
    if (res.ok && res.data.checkoutUrl) {
      window.location.assign(res.data.checkoutUrl);
      return;
    }
    setRetrying(false);
    setRetryError(res.ok ? 'Could not start the payment.' : res.message);
  }

  let title: string;
  let body: React.ReactNode;
  if (waiting) {
    title = gaveUp ? 'Still confirming your payment' : 'Confirming your payment…';
    body = gaveUp
      ? "This is taking longer than usual. You don't need to pay again. Your booking will appear in My bookings as soon as it's confirmed, and any money taken without a booking is refunded automatically."
      : 'This usually takes a few seconds. Please keep this page open.';
  } else if (payment.status === 'SUCCEEDED') {
    title = 'Payment confirmed';
    body = 'Taking you to your ticket…';
  } else if (payment.status === 'FAILED') {
    title = "Payment didn't go through";
    body = `${FAILURE_MESSAGES[payment.failureReason ?? ''] ?? 'The payment was not completed.'} You have not been charged. Your seats are still held for a short while.`;
  } else {
    title = "We couldn't confirm your seats";
    body = `${REFUND_MESSAGES[payment.failureReason ?? ''] ?? 'Something went wrong with your booking.'} ${
      payment.status === 'REFUNDED'
        ? `Your ${formatPrice(payment.amountPaise)} has been refunded.`
        : `Your ${formatPrice(payment.amountPaise)} is being refunded.`
    }`;
  }

  return (
    <div className="mx-auto max-w-md py-8 text-center">
      {waiting && !gaveUp && (
        <div
          aria-hidden
          className="mx-auto mb-6 size-10 animate-spin rounded-full border-4 border-line border-t-accent motion-reduce:animate-none"
        />
      )}
      <div role="status" aria-live="polite">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-ink-muted">{body}</p>
      </div>

      {payment.status === 'FAILED' && (
        <div className="mt-6 space-y-3">
          {retryError && (
            <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong">
              {retryError}
            </p>
          )}
          <button
            type="button"
            onClick={tryAgain}
            disabled={retrying}
            className="h-11 w-full rounded-lg bg-accent font-medium text-accent-ink hover:bg-accent-strong disabled:opacity-60"
          >
            {retrying ? 'Opening payment…' : 'Try paying again'}
          </button>
          <Link href={`/checkout/${payment.reservationId}`} className="block text-sm font-medium text-accent-strong hover:underline">
            Back to checkout
          </Link>
        </div>
      )}

      {(gaveUp || payment.status === 'REFUND_PENDING' || payment.status === 'REFUNDED') && (
        <Link
          href="/bookings"
          className="mt-6 inline-flex h-11 items-center rounded-lg border border-line-strong px-5 font-medium hover:bg-surface"
        >
          Go to My bookings
        </Link>
      )}
    </div>
  );
}
