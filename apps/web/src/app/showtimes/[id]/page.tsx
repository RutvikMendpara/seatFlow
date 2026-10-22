import type { Metadata } from 'next';
import Link from 'next/link';
import { SeatPicker } from '@/components/seat-picker';
import { apiGet } from '@/lib/api';
import {
  certificateLabel,
  formatShowDate,
  formatTime,
  showFormatLabel,
} from '@/lib/format';
import { param, type SearchParams } from '@/lib/search-params';
import { getCurrentUser } from '@/lib/session';
import type { Availability, ShowtimeDetail } from '@/lib/types';

type Props = { params: Promise<{ id: string }>; searchParams: SearchParams };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const show = await apiGet<ShowtimeDetail>(`/showtimes/${id}`);
  return { title: `${show.movie.title} at ${show.cinema.name}` };
}

export default async function ShowtimePage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const [show, availability, user] = await Promise.all([
    apiGet<ShowtimeDetail>(`/showtimes/${id}`),
    apiGet<Availability>(`/showtimes/${id}/seats`),
    getCurrentUser(),
  ]);

  // Seats picked before signing in come back in ?seats=.
  const valid = new Set(show.layout.seats.map((s) => s.id));
  const initialSelection = (param(sp.seats) ?? '')
    .split(',')
    .filter((seatId) => valid.has(seatId))
    .slice(0, 10);
  const started = new Date(show.startsAt).getTime() <= Date.now();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/movies/${show.movie.slug}`}
          className="text-sm font-medium text-accent-strong hover:underline"
        >
          ← Other showtimes
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">{show.movie.title}</h1>
        <p className="mt-1 text-ink-muted">
          {certificateLabel(show.movie.certificate)} · {show.language} ·{' '}
          {showFormatLabel(show.format)}
        </p>
        <p className="mt-3 font-medium">
          {show.cinema.name}, {show.auditorium}
        </p>
        <p className="text-ink-muted">
          {formatShowDate(show.startsAt)}, {formatTime(show.startsAt)}
        </p>
      </div>

      {show.status === 'CANCELLED' || started ? (
        <p className="rounded-xl border border-line bg-surface p-6">
          {show.status === 'CANCELLED'
            ? 'This show has been cancelled.'
            : 'This show has already started, so it is no longer taking bookings.'}
        </p>
      ) : (
        <SeatPicker
          key={show.id}
          show={show}
          initialSeats={availability.seats}
          initialSelection={initialSelection}
          signedIn={Boolean(user)}
        />
      )}
    </div>
  );
}
