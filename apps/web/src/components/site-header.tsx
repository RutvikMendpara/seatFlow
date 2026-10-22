import Link from 'next/link';
import { getCities, getSelectedCity } from '@/lib/city';
import { getCurrentUser } from '@/lib/session';
import { CityPicker } from './city-picker';
import { SignOutButton } from './sign-out-button';

export async function SiteHeader() {
  const cities = await getCities();
  const city = await getSelectedCity();
  const user = await getCurrentUser();

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

        <div className="ml-auto flex items-center gap-4 sm:ml-0">
          <CityPicker cities={cities} selected={city.slug} />
          {user ? (
            <>
              <Link href="/bookings" className="text-sm font-medium whitespace-nowrap hover:text-accent-strong">
                My bookings
              </Link>
              <span className="hidden sm:inline">
                <SignOutButton />
              </span>
            </>
          ) : (
            <Link href="/login" className="text-sm font-medium whitespace-nowrap hover:text-accent-strong">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
