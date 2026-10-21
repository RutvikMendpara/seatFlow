import type { Certificate, SeatCategory, ShowFormat } from './types';

const TIME_ZONE = 'Asia/Kolkata';

const timeFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const longDateFormat = new Intl.DateTimeFormat('en-IN', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

export function formatTime(iso: string) {
  return timeFormat.format(new Date(iso)).toUpperCase();
}

export function formatShowDate(iso: string) {
  return longDateFormat.format(new Date(iso));
}

// For YYYY-MM-DD strings that already represent an IST day.
export function formatDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', ...opts }).format(d);
  return {
    weekday: part({ weekday: 'short' }),
    day: part({ day: 'numeric' }),
    month: part({ month: 'short' }),
    full: part({ weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

export function formatReleaseDate(date: string) {
  const { day, month } = formatDay(date);
  return `${day} ${month}`;
}

export function formatPrice(paise: number) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}

export function formatRuntime(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

const certificateLabels: Record<Certificate, string> = {
  U: 'U',
  UA7: 'UA 7+',
  UA13: 'UA 13+',
  UA16: 'UA 16+',
  A: 'A',
};

export const certificateLabel = (c: Certificate) => certificateLabels[c];

const formatLabels: Record<ShowFormat, string> = {
  STANDARD: '2D',
  THREE_D: '3D',
  IMAX: 'IMAX',
};

export const showFormatLabel = (f: ShowFormat) => formatLabels[f];

const categoryLabels: Record<SeatCategory, string> = {
  CLASSIC: 'Classic',
  PREMIUM: 'Premium',
  RECLINER: 'Recliner',
};

export const seatCategoryLabel = (c: SeatCategory) => categoryLabels[c];
