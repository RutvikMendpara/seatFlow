import Link from 'next/link';
import { certificateLabel, formatReleaseDate } from '@/lib/format';
import type { Movie } from '@/lib/types';
import { Poster } from './poster';

type Props = { movie: Movie; showRelease?: boolean };

export function MovieCard({ movie, showRelease = false }: Props) {
  return (
    <Link href={`/movies/${movie.slug}`} className="group block rounded-xl">
      <Poster
        movie={movie}
        className="shadow-sm transition group-hover:-translate-y-0.5 group-hover:shadow-md"
      />
      <h3 className="mt-3 leading-snug font-semibold group-hover:text-accent-strong">
        {movie.title}
      </h3>
      <p className="mt-0.5 text-sm text-ink-muted">
        {certificateLabel(movie.certificate)} · {movie.languages.join(', ')}
      </p>
      {showRelease ? (
        <p className="mt-1 text-sm font-medium text-ink">
          Releasing {formatReleaseDate(movie.releaseDate)}
        </p>
      ) : (
        movie.rating !== null && (
          <p className="mt-1 text-sm font-medium">
            <span aria-hidden className="text-accent">★ </span>
            {movie.rating.toFixed(1)}
            <span className="text-ink-subtle">/10</span>
          </p>
        )
      )}
    </Link>
  );
}
