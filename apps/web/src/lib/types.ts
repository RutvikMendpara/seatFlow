export type City = { slug: string; name: string; state: string };

export type User = { id: string; email: string; name: string; role: 'CUSTOMER' | 'ADMIN' };

export type Certificate = 'U' | 'UA7' | 'UA13' | 'UA16' | 'A';
export type SeatCategory = 'CLASSIC' | 'PREMIUM' | 'RECLINER';
export type ShowFormat = 'STANDARD' | 'THREE_D' | 'IMAX';

export type Movie = {
  slug: string;
  title: string;
  synopsis: string;
  runtimeMinutes: number;
  languages: string[];
  genres: string[];
  certificate: Certificate;
  releaseDate: string;
  rating: number | null;
  posterUrl: string | null;
  trailerUrl: string | null;
};

export type MovieList = {
  movies: Movie[];
  facets: { languages: string[]; genres: string[] };
};

export type Price = { category: SeatCategory; pricePaise: number };

export type ShowtimeSummary = {
  id: string;
  startsAt: string;
  language: string;
  format: ShowFormat;
  auditorium: string;
  prices: Price[];
};

export type MovieShowtimes = {
  movie: { slug: string; title: string };
  city: { slug: string; name: string };
  languages: string[];
  dates: string[];
  date: string | null;
  cinemas: {
    slug: string;
    name: string;
    address: string;
    showtimes: ShowtimeSummary[];
  }[];
};

export type Seat = {
  id: string;
  label: string;
  row: string;
  number: number;
  category: SeatCategory;
  gridRow: number;
  gridColumn: number;
};

export type ShowtimeDetail = {
  id: string;
  startsAt: string;
  endsAt: string;
  language: string;
  format: ShowFormat;
  status: 'SCHEDULED' | 'CANCELLED';
  movie: {
    slug: string;
    title: string;
    certificate: Certificate;
    runtimeMinutes: number;
  };
  cinema: {
    slug: string;
    name: string;
    address: string;
    city: { slug: string; name: string };
  };
  auditorium: string;
  prices: Price[];
  layout: { rows: number; columns: number; seats: Seat[] };
};

export type SeatStatus = 'AVAILABLE' | 'HELD' | 'SOLD';

export type SeatState = { id: string; status: SeatStatus; version: number };

export type Availability = { showtimeId: string; seats: SeatState[] };

export type PriceBreakdown = {
  subtotalPaise: number;
  feePaise: number;
  taxPaise: number;
  amountPaise: number;
};

export type PaymentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type Reservation = {
  id: string;
  showtimeId: string;
  status: 'HELD' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'EXPIRED' | 'CANCELLED';
  expiresAt: string;
  serverTime: string;
  subtotalPaise: number;
  price: PriceBreakdown;
  latestPayment: { id: string; status: PaymentStatus; failureReason: string | null } | null;
  bookingReference: string | null;
  seats: { id: string; label: string; category: SeatCategory; pricePaise: number }[];
};

export type Payment = PriceBreakdown & {
  id: string;
  reservationId: string;
  status: PaymentStatus;
  currency: string;
  checkoutUrl: string | null;
  failureReason: string | null;
  bookingReference: string | null;
};

export type Booking = {
  reference: string;
  createdAt: string;
  movie: { slug: string; title: string; certificate: Certificate };
  cinema: { slug: string; name: string; address: string };
  auditorium: string;
  startsAt: string;
  language: string;
  format: ShowFormat;
  seats: string[];
  subtotalPaise: number;
  feePaise: number;
  taxPaise: number;
  totalPaise: number;
  checkedInAt: string | null;
};

export type BookingWithTicket = Booking & {
  ticket: { token: string; issuedAt: string; checkedInAt: string | null } | null;
};
