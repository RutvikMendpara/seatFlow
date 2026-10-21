'use server';

import { cookies } from 'next/headers';
import { CITY_COOKIE } from '@/lib/city';

export async function selectCity(formData: FormData) {
  const slug = formData.get('city');
  if (typeof slug !== 'string' || !/^[a-z0-9-]{1,50}$/.test(slug)) return;

  (await cookies()).set(CITY_COOKIE, slug, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
  });
}
