import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { apiGet } from './api';
import type { City } from './types';

export const CITY_COOKIE = 'city';
const DEFAULT_CITY = 'mumbai';

// Called by both the header and the page, so dedupe within a request.
export const getCities = cache(() => apiGet<City[]>('/cities'));

export async function getSelectedCity(): Promise<City> {
  const cities = await getCities();
  const slug = (await cookies()).get(CITY_COOKIE)?.value ?? DEFAULT_CITY;
  const city = cities.find((c) => c.slug === slug) ?? cities[0];
  if (!city) throw new Error('No cities configured');
  return city;
}
