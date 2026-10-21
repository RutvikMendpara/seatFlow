'use client';

import { useTransition } from 'react';
import { selectCity } from '@/app/actions';
import type { City } from '@/lib/types';

type Props = { cities: City[]; selected: string };

export function CityPicker({ cities, selected }: Props) {
  const [pending, startTransition] = useTransition();

  return (
    <form action={selectCity}>
      <label htmlFor="city" className="sr-only">
        City
      </label>
      <select
        id="city"
        name="city"
        defaultValue={selected}
        disabled={pending}
        onChange={(e) => {
          const data = new FormData();
          data.set('city', e.target.value);
          startTransition(() => selectCity(data));
        }}
        className="h-10 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink hover:border-line-strong disabled:opacity-60"
      >
        {cities.map((city) => (
          <option key={city.slug} value={city.slug}>
            {city.name}
          </option>
        ))}
      </select>
      <noscript>
        <button type="submit" className="ml-2 text-sm underline">
          Change
        </button>
      </noscript>
    </form>
  );
}
