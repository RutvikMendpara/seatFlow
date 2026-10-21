import type { Metadata } from 'next';
import Link from 'next/link';
import { SeatLayout } from '@/components/seat-layout';
import { apiGet } from '@/lib/api';
import {
  certificateLabel,
  formatShowDate,
  formatTime,
  showFormatLabel,
} from '@/lib/format';
import type { ShowtimeDetail } from '@/lib/types';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const show = await apiGet<ShowtimeDetail>(`/showtimes/${id}`);
  return { title: `${show.movie.title} at ${show.cinema.name}` };
}

export default async function ShowtimePage({ params }: Props) {
  const { id } = await params;
  const show = await apiGet<ShowtimeDetail>(`/showtimes/${id}`);

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

      {show.status === 'CANCELLED' ? (
        <p className="rounded-xl border border-line bg-surface p-6">
          This show has been cancelled.
        </p>
      ) : (
        <SeatLayout layout={show.layout} prices={show.prices} />
      )}
    </div>
  );
}
