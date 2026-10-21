import 'server-only';
import { notFound } from 'next/navigation';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | undefined>;

export async function apiGet<T>(path: string, query: Query = {}): Promise<T> {
  const url = new URL(`/api${path}`, API_URL);
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }

  // Availability changes constantly, so nothing here is cached for now.
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) notFound();
  if (!res.ok) {
    throw new ApiError(res.status, `GET ${url.pathname} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}
