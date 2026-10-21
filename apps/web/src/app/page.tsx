import Link from 'next/link';
import { ChipLink } from '@/components/chip-link';
import { MovieCard } from '@/components/movie-card';
import { apiGet } from '@/lib/api';
import { getSelectedCity } from '@/lib/city';
import { param, withParam, type SearchParams } from '@/lib/search-params';
import type { MovieList } from '@/lib/types';

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = {
    language: param(sp.language),
    genre: param(sp.genre),
    q: param(sp.q)?.trim() || undefined,
  };
  const city = await getSelectedCity();

  const [nowShowing, comingSoon] = await Promise.all([
    apiGet<MovieList>('/movies', { city: city.slug, ...filters }),
    apiGet<MovieList>('/movies', { status: 'coming_soon' }),
  ]);
  const hasFilters = Boolean(filters.language || filters.genre || filters.q);

  return (
    <div className="space-y-12">
      <section aria-labelledby="now-showing">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="now-showing" className="text-2xl font-bold tracking-tight">
            Movies in {city.name}
          </h1>
          {hasFilters && (
            <Link href="/" className="text-sm font-medium text-accent-strong hover:underline">
              Clear filters
            </Link>
          )}
        </div>
        {filters.q && (
          <p className="mt-1 text-ink-muted">
            Results for <span className="font-medium text-ink">“{filters.q}”</span>
          </p>
        )}

        <form action="/" className="mt-4 sm:hidden">
          <label htmlFor="search-mobile" className="sr-only">
            Search movies
          </label>
          <input
            id="search-mobile"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Search movies"
            className="h-11 w-full rounded-lg border border-line bg-surface px-3 placeholder:text-ink-subtle"
          />
        </form>

        <div className="mt-5 space-y-3">
          <FilterRow
            label="Language"
            options={nowShowing.facets.languages}
            selected={filters.language}
            paramKey="language"
            filters={filters}
          />
          <FilterRow
            label="Genre"
            options={nowShowing.facets.genres}
            selected={filters.genre}
            paramKey="genre"
            filters={filters}
          />
        </div>

        {nowShowing.movies.length > 0 ? (
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {nowShowing.movies.map((movie) => (
              <li key={movie.slug}>
                <MovieCard movie={movie} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-6 rounded-xl border border-dashed border-line-strong bg-surface p-10 text-center">
            <p className="font-medium">No movies match these filters in {city.name}.</p>
            <Link href="/" className="mt-2 inline-block text-sm font-medium text-accent-strong hover:underline">
              Show all movies
            </Link>
          </div>
        )}
      </section>

      {comingSoon.movies.length > 0 && !hasFilters && (
        <section aria-labelledby="coming-soon">
          <h2 id="coming-soon" className="text-xl font-bold tracking-tight">
            Coming soon
          </h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
            {comingSoon.movies.map((movie) => (
              <li key={movie.slug}>
                <MovieCard movie={movie} showRelease />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type FilterRowProps = {
  label: string;
  options: string[];
  selected: string | undefined;
  paramKey: 'language' | 'genre';
  filters: Record<string, string | undefined>;
};

function FilterRow({ label, options, selected, paramKey, filters }: FilterRowProps) {
  if (options.length === 0) return null;
  return (
    <nav aria-label={`Filter by ${label.toLowerCase()}`} className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-sm text-ink-subtle">{label}</span>
      <ul className="no-scrollbar -my-1 flex gap-2 overflow-x-auto py-1 sm:flex-wrap">
        {options.map((option) => {
          const active = option === selected;
          return (
            <li key={option}>
              <ChipLink
                href={withParam('/', filters, paramKey, active ? undefined : option)}
                active={active}
              >
                {option}
              </ChipLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
