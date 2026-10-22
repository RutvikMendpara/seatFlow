// Browser-side calls go to /api on this app, which proxies to the API.

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; message: string; body: Record<string, unknown> };

export async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        ...(init.body !== undefined && { 'content-type': 'application/json' }),
        ...init.headers,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'Could not reach SeatFlow. Check your connection and try again.',
      body: {},
    };
  }

  if (res.status === 204) return { ok: true, status: 204, data: undefined as T };
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok) return { ok: true, status: res.status, data: body as T };

  const message = Array.isArray(body.message)
    ? String(body.message[0])
    : typeof body.message === 'string'
      ? body.message
      : 'Something went wrong. Please try again.';
  return { ok: false, status: res.status, message, body };
}

// Only allow relative paths, so ?next= can't send someone to another site.
export function safeNext(next: string | null | undefined, fallback = '/') {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
