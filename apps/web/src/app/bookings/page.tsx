import type { Metadata } from 'next';
import Link from 'next/link';
import { SignOutButton } from '@/components/sign-out-button';
import { apiGet } from '@/lib/api';
import { formatShowDate, formatTime } from '@/lib/format';
import { requireUser } from '@/lib/session';
import type { Booking } from '@/lib/types';

export const metadata: Metadata = { title: 'My bookings' };

export default async function BookingsPage() {
  const user = await requireUser('/bookings');
  const bookings = await apiGet<Booking[]>('/bookings');
  const now = Date.now();
  const upcoming = bookings
    .filter((b) => new Date(b.startsAt).getTime() > now)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = bookings.filter((b) => new Date(b.startsAt).getTime() <= now);

  return (
    <div className="mx-auto max-w-3xl space-y-10">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My bookings</h1>
          <p className="text-sm text-ink-muted">Signed in as {user.email}</p>
        </div>
        <SignOutButton />
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
          <p className="font-medium">No bookings yet.</p>
          <Link href="/" className="mt-2 inline-block text-sm font-medium text-accent-strong hover:underline">
            Find a movie
          </Link>
        </div>
      ) : (
        <>
          <BookingList title="Upcoming" bookings={upcoming} empty="Nothing coming up." />
          {past.length > 0 && <BookingList title="Past" bookings={past} />}
        </>
      )}
    </div>
  );
}

function BookingList({ title, bookings, empty }: { title: string; bookings: Booking[]; empty?: string }) {
  return (
    <section aria-labelledby={`${title}-heading`}>
      <h2 id={`${title}-heading`} className="text-lg font-semibold">
        {title}
      </h2>
      {bookings.length === 0 ? (
        <p className="mt-2 text-ink-muted">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {bookings.map((b) => (
            <li key={b.reference}>
              <Link
                href={`/bookings/${b.reference}`}
                className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-line-strong"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{b.movie.title}</p>
                    <p className="text-sm text-ink-muted">
                      {formatShowDate(b.startsAt)}, {formatTime(b.startsAt)} · {b.cinema.name}
                    </p>
                    <p className="mt-1 text-sm">Seats {b.seats.join(', ')}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm text-ink-muted">{b.reference}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
