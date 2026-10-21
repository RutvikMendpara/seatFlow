import type { Metadata } from 'next';
import Link from 'next/link';
import { ChipLink } from '@/components/chip-link';
import { Poster } from '@/components/poster';
import { apiGet } from '@/lib/api';
import { getSelectedCity } from '@/lib/city';
import {
  certificateLabel,
  formatDay,
  formatPrice,
  formatReleaseDate,
  formatRuntime,
  formatTime,
  showFormatLabel,
} from '@/lib/format';
import { param, withParam, type SearchParams } from '@/lib/search-params';
import type { Movie, MovieShowtimes, ShowtimeSummary } from '@/lib/types';

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: SearchParams;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const movie = await apiGet<Movie>(`/movies/${slug}`);
  return { title: movie.title, description: movie.synopsis };
}

export default async function MoviePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const date = param(sp.date);
  const filters = {
    date: date && DATE_PATTERN.test(date) ? date : undefined,
    language: param(sp.language),
  };
  const city = await getSelectedCity();

  const [movie, schedule] = await Promise.all([
    apiGet<Movie>(`/movies/${slug}`),
    apiGet<MovieShowtimes>(`/movies/${slug}/showtimes`, {
      city: city.slug,
      ...filters,
    }),
  ]);
  const pathname = `/movies/${slug}`;

  return (
    <div className="space-y-10">
      <section className="grid gap-6 sm:grid-cols-[220px_1fr] sm:gap-8">
        <Poster movie={movie} className="max-w-[220px] shadow-md" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-balance">{movie.title}</h1>
          <p className="mt-2 text-ink-muted">
            {[
              certificateLabel(movie.certificate),
              formatRuntime(movie.runtimeMinutes),
              movie.genres.join(', '),
            ].join(' · ')}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {movie.languages.map((language) => (
              <span
                key={language}
                className="rounded-md border border-line bg-surface px-2 py-0.5 text-sm"
              >
                {language}
              </span>
            ))}
          </div>
          {movie.rating !== null && (
            <p className="mt-4 text-lg font-semibold">
              <span aria-hidden className="text-accent">★ </span>
              {movie.rating.toFixed(1)}
              <span className="text-base font-normal text-ink-subtle">/10</span>
            </p>
          )}
          <p className="mt-4 max-w-prose leading-relaxed text-ink-muted">{movie.synopsis}</p>
          <p className="mt-4 text-sm text-ink-subtle">
            Release date: {formatReleaseDate(movie.releaseDate)}
          </p>
        </div>
      </section>

      <section aria-labelledby="showtimes">
        <h2 id="showtimes" className="text-xl font-bold tracking-tight">
          Showtimes in {city.name}
        </h2>

        {schedule.dates.length === 0 && !filters.language ? (
          <p className="mt-4 rounded-xl border border-dashed border-line-strong bg-surface p-8 text-center text-ink-muted">
            No shows in {city.name} yet. Try another city, or check back closer to release.
          </p>
        ) : (
          <>
            <nav aria-label="Show dates" className="mt-4">
              <ul className="no-scrollbar -my-1 flex gap-2 overflow-x-auto py-1">
                {schedule.dates.map((day) => {
                  const d = formatDay(day);
                  const active = day === schedule.date;
                  return (
                    <li key={day}>
                      <Link
                        href={withParam(pathname, filters, 'date', day)}
                        scroll={false}
                        aria-current={active ? 'date' : undefined}
                        aria-label={d.full}
                        className={`flex w-16 flex-col items-center rounded-xl border py-2 transition-colors ${
                          active
                            ? 'border-accent bg-accent text-accent-ink'
                            : 'border-line bg-surface hover:border-line-strong'
                        }`}
                      >
                        <span className="text-xs uppercase">{d.weekday}</span>
                        <span className="text-lg leading-tight font-bold">{d.day}</span>
                        <span className="text-xs uppercase">{d.month}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {schedule.languages.length > 1 && (
              <nav aria-label="Show language" className="mt-4">
                <ul className="flex flex-wrap gap-2">
                  <li>
                    <ChipLink
                      href={withParam(pathname, filters, 'language', undefined)}
                      active={!filters.language}
                    >
                      All languages
                    </ChipLink>
                  </li>
                  {schedule.languages.map((language) => (
                    <li key={language}>
                      <ChipLink
                        href={withParam(pathname, filters, 'language', language)}
                        active={filters.language === language}
                      >
                        {language}
                      </ChipLink>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {schedule.cinemas.length === 0 ? (
              <p className="mt-6 text-ink-muted">No shows on this day. Pick another date.</p>
            ) : (
              <ul className="mt-6 space-y-3">
                {schedule.cinemas.map((cinema) => (
                  <li
                    key={cinema.slug}
                    className="rounded-xl border border-line bg-surface p-4 sm:p-5"
                  >
                    <h3 className="font-semibold">{cinema.name}</h3>
                    <p className="text-sm text-ink-subtle">{cinema.address}</p>
                    <ul className="mt-4 flex flex-wrap gap-3">
                      {cinema.showtimes.map((show) => (
                        <li key={show.id}>
                          <ShowtimeChip
                            show={show}
                            showLanguage={!filters.language && schedule.languages.length > 1}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ShowtimeChip({ show, showLanguage }: { show: ShowtimeSummary; showLanguage: boolean }) {
  const fromPrice = show.prices[0];
  const details = [
    showLanguage ? show.language : null,
    show.format !== 'STANDARD' ? showFormatLabel(show.format) : null,
  ].filter(Boolean);
  const label = [
    formatTime(show.startsAt),
    show.language,
    showFormatLabel(show.format),
    show.auditorium,
    fromPrice ? `from ${formatPrice(fromPrice.pricePaise)}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Link
      href={`/showtimes/${show.id}`}
      aria-label={label}
      className="flex min-w-24 flex-col items-center rounded-lg border border-success/40 px-3 py-2 text-success transition-colors hover:bg-success-soft"
    >
      <span className="text-sm font-semibold">{formatTime(show.startsAt)}</span>
      {details.length > 0 && (
        <span className="text-[11px] tracking-wide text-ink-muted uppercase">
          {details.join(' · ')}
        </span>
      )}
      {fromPrice && (
        <span className="text-[11px] text-ink-subtle">from {formatPrice(fromPrice.pricePaise)}</span>
      )}
    </Link>
  );
}
