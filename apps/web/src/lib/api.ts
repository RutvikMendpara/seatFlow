import 'server-only';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const SESSION_COOKIE = 'sf_session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | undefined>;

// Server-side fetch to the API, passing along the user's session if there is one.
export async function apiFetch(path: string, query: Query = {}) {
  const url = new URL(`/api${path}`, API_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }

  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  // Availability changes constantly, so nothing here is cached for now.
  return fetch(url, {
    cache: 'no-store',
    headers: session ? { cookie: `${SESSION_COOKIE}=${session}` } : {},
  });
}

export async function apiGet<T>(path: string, query: Query = {}): Promise<T> {
  const res = await apiFetch(path, query);
  if (res.status === 404) notFound();
  if (!res.ok) throw new ApiError(res.status, `GET /api${path} failed with ${res.status}`);
  return res.json() as Promise<T>;
}
