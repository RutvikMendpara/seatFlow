import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { apiFetch } from './api';
import type { User } from './types';

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const res = await apiFetch('/auth/me');
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET /api/auth/me failed with ${res.status}`);
  return ((await res.json()) as { user: User }).user;
});

export async function requireUser(returnTo: string) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(returnTo)}`);
  return user;
}
