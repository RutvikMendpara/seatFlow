'use client';

import { useActionState } from 'react';
import { startPayment } from '@/app/checkout/actions';

type Props = { reservationId: string; label: string; pendingLabel?: string };

export function PayButton({ reservationId, label, pendingLabel = 'Opening payment…' }: Props) {
  const [state, action, pending] = useActionState(startPayment, { error: null });

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="reservationId" value={reservationId} />
      {state.error && (
        <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-lg bg-accent text-base font-semibold text-accent-ink hover:bg-accent-strong disabled:opacity-60"
      >
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}
