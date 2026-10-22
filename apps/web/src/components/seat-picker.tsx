'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSeatUpdates, type LiveStatus } from '@/hooks/use-seat-updates';
import { callApi } from '@/lib/client-api';
import { formatPrice, seatCategoryLabel } from '@/lib/format';
import { idempotencyKey } from '@/lib/idempotency';
import { buildLines, mergeSeats, neighbour, type Direction, type SeatStates } from '@/lib/seat-map';
import type { Availability, Seat, SeatState, ShowtimeDetail } from '@/lib/types';

const MAX_SEATS = 10;

const KEYS: Record<string, Direction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
};

type Props = {
  show: ShowtimeDetail;
  initialSeats: SeatState[];
  initialSelection: string[];
  signedIn: boolean;
};

export function SeatPicker({ show, initialSeats, initialSelection, signedIn }: Props) {
  const router = useRouter();
  const [states, setStates] = useState<SeatStates>(
    () => new Map(initialSeats.map((s) => [s.id, s])),
  );
  const [selected, setSelected] = useState<string[]>(initialSelection);
  const [announcement, setAnnouncement] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const holdKey = useRef<{ selection: string; key: string } | null>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const seatsById = useMemo(() => new Map(show.layout.seats.map((s) => [s.id, s])), [show]);
  const priceOf = useMemo(() => new Map(show.prices.map((p) => [p.category, p.pricePaise])), [show]);
  const lines = useMemo(() => buildLines(show.layout), [show]);
  const [focusedId, setFocusedId] = useState(
    () =>
      initialSelection[0] ??
      show.layout.seats.find((s) => states.get(s.id)?.status === 'AVAILABLE')?.id ??
      show.layout.seats[0]?.id,
  );

  const label = useCallback((id: string) => seatsById.get(id)?.label ?? id, [seatsById]);

  const resync = useCallback(async () => {
    const res = await callApi<Availability>(`/showtimes/${show.id}/seats`);
    if (res.ok) setStates((current) => mergeSeats(current, res.data.seats, 'snapshot'));
  }, [show.id]);

  const live = useSeatUpdates(show.id, {
    onSeats: (seats) => setStates((current) => mergeSeats(current, seats, 'update')),
    onResync: resync,
  });

  // Someone else took a seat this user had picked.
  useEffect(() => {
    const lost = selected.filter((id) => states.get(id)?.status !== 'AVAILABLE');
    if (lost.length === 0) return;
    setSelected((current) => current.filter((id) => !lost.includes(id)));
    const message = `${lost.map(label).join(', ')} ${lost.length === 1 ? 'was' : 'were'} just taken. Please pick another seat.`;
    setNotice(message);
    setAnnouncement(message);
  }, [states, selected, label]);

  const total = selected.reduce(
    (sum, id) => sum + (priceOf.get(seatsById.get(id)!.category) ?? 0),
    0,
  );

  function toggle(seat: Seat) {
    const status = states.get(seat.id)?.status ?? 'AVAILABLE';
    if (status !== 'AVAILABLE') {
      setAnnouncement(`${seat.label} is not available.`);
      return;
    }
    setNotice(null);
    if (selected.includes(seat.id)) {
      const next = selected.filter((id) => id !== seat.id);
      setSelected(next);
      setAnnouncement(`${seat.label} removed. ${next.length} selected.`);
      return;
    }
    if (selected.length >= MAX_SEATS) {
      setAnnouncement(`You can pick up to ${MAX_SEATS} seats.`);
      setNotice(`You can pick up to ${MAX_SEATS} seats in one booking.`);
      return;
    }
    const next = [...selected, seat.id];
    setSelected(next);
    setAnnouncement(`${seat.label} selected. ${next.length} selected.`);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, seat: Seat) {
    const direction = KEYS[event.key];
    if (!direction) return;
    event.preventDefault();
    const target = neighbour(show.layout.seats, seat, direction);
    if (!target) return;
    setFocusedId(target.id);
    buttons.current.get(target.id)?.focus();
  }

  async function continueToCheckout() {
    if (!signedIn) {
      const back = `/showtimes/${show.id}?seats=${selected.join(',')}`;
      router.push(`/login?next=${encodeURIComponent(back)}`);
      return;
    }

    // Same key for a retry of the same selection, so a timeout followed by
    // a second click can't hold seats twice.
    const selection = [...selected].sort().join(',');
    if (holdKey.current?.selection !== selection) {
      holdKey.current = { selection, key: idempotencyKey() };
    }

    setPending(true);
    setNotice(null);
    const res = await callApi<{ id: string }>('/reservations', {
      method: 'POST',
      body: { showtimeId: show.id, seatIds: selected },
      headers: { 'Idempotency-Key': holdKey.current.key },
    });
    if (res.ok) {
      router.push(`/checkout/${res.data.id}`);
      return;
    }

    setPending(false);
    if (res.status === 401) {
      router.push(`/login?next=${encodeURIComponent(`/showtimes/${show.id}?seats=${selected.join(',')}`)}`);
      return;
    }
    if (res.status === 409 && Array.isArray(res.body.unavailableSeatIds)) {
      // Show them as taken straight away. The refetch brings the real state.
      const taken = res.body.unavailableSeatIds as string[];
      setStates((current) => {
        const next = new Map(current);
        for (const id of taken) next.set(id, { id, status: 'HELD', version: current.get(id)?.version ?? 0 });
        return next;
      });
      void resync();
      return;
    }
    setNotice(res.message);
    setAnnouncement(res.message);
  }

  const columns = `2rem repeat(${show.layout.columns}, 1.75rem)`;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <LiveBadge status={live} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface p-4 sm:p-6">
        <div className="mx-auto w-max" role="group" aria-label="Seats. Use the arrow keys to move between seats.">
          {lines.map((line) => {
            if (line.kind === 'gap') return <div key={`gap-${line.key}`} className="h-4" />;
            if (line.kind === 'header') {
              return (
                <p
                  key={`h-${line.category}`}
                  className="mt-4 mb-2 border-b border-line pb-1 text-xs font-medium tracking-wide text-ink-muted uppercase first:mt-0"
                >
                  {seatCategoryLabel(line.category)} · {formatPrice(priceOf.get(line.category) ?? 0)}
                </p>
              );
            }
            return (
              <div
                key={line.label}
                role="group"
                aria-label={`Row ${line.label}`}
                className="mb-1.5 grid items-center"
                style={{ gridTemplateColumns: columns }}
              >
                <span aria-hidden className="text-xs font-medium text-ink-subtle">
                  {line.label}
                </span>
                {line.seats.map((seat) => (
                  <SeatButton
                    key={seat.id}
                    seat={seat}
                    status={states.get(seat.id)?.status ?? 'AVAILABLE'}
                    selected={selected.includes(seat.id)}
                    price={priceOf.get(seat.category) ?? 0}
                    focusable={seat.id === focusedId}
                    onToggle={() => {
                      setFocusedId(seat.id);
                      toggle(seat);
                    }}
                    onKeyDown={(e) => onKeyDown(e, seat)}
                    buttonRef={(el) => {
                      if (el) buttons.current.set(seat.id, el);
                      else buttons.current.delete(seat.id);
                    }}
                  />
                ))}
              </div>
            );
          })}

          <div className="mt-8" aria-hidden>
            <div className="mx-auto h-3 w-4/5 rounded-[50%] border-t-4 border-line-strong" />
            <p className="text-center text-[11px] tracking-widest text-ink-subtle uppercase">
              Screen this way
            </p>
          </div>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        {notice && (
          <p role="alert" className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-strong">
            {notice}
          </p>
        )}
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            {selected.length > 0 ? (
              <>
                <p className="font-semibold">
                  {selected.length} {selected.length === 1 ? 'seat' : 'seats'} · {formatPrice(total)}
                </p>
                <p className="truncate text-sm text-ink-muted">
                  {selected
                    .map(label)
                    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
                    .join(', ')}
                </p>
              </>
            ) : (
              <p className="text-ink-muted">Pick up to {MAX_SEATS} seats</p>
            )}
          </div>
          <button
            type="button"
            onClick={continueToCheckout}
            disabled={selected.length === 0 || pending}
            className="h-11 shrink-0 rounded-lg bg-accent px-5 font-medium text-accent-ink hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? 'Holding seats…' : signedIn ? 'Continue' : 'Sign in to continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

type SeatButtonProps = {
  seat: Seat;
  status: SeatState['status'];
  selected: boolean;
  price: number;
  focusable: boolean;
  onToggle: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
};

function SeatButton({ seat, status, selected, price, focusable, onToggle, onKeyDown, buttonRef }: SeatButtonProps) {
  const unavailable = status !== 'AVAILABLE';
  const state = unavailable ? (status === 'SOLD' ? 'sold' : 'on hold') : null;
  const description = [seat.label, seatCategoryLabel(seat.category), formatPrice(price), state]
    .filter(Boolean)
    .join(', ');

  return (
    <button
      ref={buttonRef}
      type="button"
      tabIndex={focusable ? 0 : -1}
      aria-label={description}
      aria-pressed={selected}
      aria-disabled={unavailable}
      onClick={onToggle}
      onKeyDown={onKeyDown}
      style={{ gridColumnStart: seat.gridColumn + 2 }}
      className={`mx-auto grid size-6 place-items-center rounded-t-md rounded-b-sm border text-[10px] transition-colors ${seatStyle(status, selected)}`}
    >
      {status === 'SOLD' ? '×' : selected ? '✓' : seat.number}
    </button>
  );
}

// Each state has its own shape or mark, not just a colour.
function seatStyle(status: SeatState['status'], selected: boolean) {
  if (selected) return 'border-accent bg-accent font-bold text-accent-ink';
  if (status === 'SOLD') return 'cursor-not-allowed border-transparent bg-line-strong text-ink-muted';
  if (status === 'HELD') {
    return 'cursor-not-allowed border-line text-ink-subtle bg-[repeating-linear-gradient(135deg,var(--color-line)_0_2px,transparent_2px_5px)]';
  }
  return 'border-success/60 bg-surface text-ink-muted hover:border-accent hover:text-accent-strong';
}

function Legend() {
  const items = [
    { label: 'Available', className: 'border-success/60 bg-surface', mark: '' },
    { label: 'Selected', className: 'border-accent bg-accent text-accent-ink', mark: '✓' },
    {
      label: 'On hold',
      className: 'border-line bg-[repeating-linear-gradient(135deg,var(--color-line)_0_2px,transparent_2px_5px)]',
      mark: '',
    },
    { label: 'Sold', className: 'border-transparent bg-line-strong text-ink-muted', mark: '×' },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-ink-muted">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span
            aria-hidden
            className={`grid size-5 place-items-center rounded-t-md rounded-b-sm border text-[10px] ${item.className}`}
          >
            {item.mark}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function LiveBadge({ status }: { status: LiveStatus }) {
  const text = { live: 'Live', connecting: 'Connecting…', offline: 'Reconnecting…' }[status];
  const dot = { live: 'bg-success', connecting: 'bg-ink-subtle', offline: 'bg-amber-500' }[status];
  return (
    <span className="flex items-center gap-2 text-sm text-ink-muted" title="Seat availability updates as others book">
      <span aria-hidden className={`size-2 rounded-full ${dot}`} />
      {text}
    </span>
  );
}
