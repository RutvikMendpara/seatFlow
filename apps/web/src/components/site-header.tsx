import Link from 'next/link';
import { getCities, getSelectedCity } from '@/lib/city';
import { CityPicker } from './city-picker';

export async function SiteHeader() {
  const cities = await getCities();
  const city = await getSelectedCity();

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Seat<span className="text-accent">Flow</span>
        </Link>

        <form action="/" className="ml-auto hidden flex-1 sm:block sm:max-w-sm">
          <label htmlFor="search" className="sr-only">
            Search movies
          </label>
          <input
            id="search"
            name="q"
            type="search"
            placeholder="Search movies"
            className="h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm placeholder:text-ink-subtle focus:bg-surface"
          />
        </form>

        <div className="ml-auto sm:ml-0">
          <CityPicker cities={cities} selected={city.slug} />
        </div>
      </div>
    </header>
  );
}
