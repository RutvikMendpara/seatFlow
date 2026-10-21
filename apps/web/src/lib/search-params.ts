export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Builds a link to the current page with one param changed or removed.
export function withParam(
  pathname: string,
  current: Record<string, string | undefined>,
  key: string,
  value: string | undefined,
) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, [key]: value })) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
