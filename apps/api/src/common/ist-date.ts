// All cinemas are in India, so "a day" always means a day in IST.
// IST has no daylight saving, so a fixed offset is enough.
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toIstDateString(instant: Date): string {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function istToday(now = new Date()): string {
  return toIstDateString(now);
}

export function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

// Returns [start, end) of the given IST day as UTC instants.
export function istDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(new Date(`${date}T00:00:00Z`).getTime() - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

// Postgres DATE columns come back from Prisma as UTC midnight.
export function dateColumn(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}
