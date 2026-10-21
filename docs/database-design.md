# Database design

PostgreSQL is the source of truth for everything the app sells. Schema lives in
`apps/api/prisma/schema.prisma`, and migrations are in `apps/api/prisma/migrations`.

## Catalogue

| Table | Notes |
|---|---|
| `cities` | Cinemas are grouped by city. Users pick a city first. |
| `movies` | `languages` and `genres` are text arrays. A movie can play in several languages, and each showtime picks one. |
| `cinemas` | Belongs to a city. |
| `auditoriums` | A screen inside a cinema. Name is unique per cinema. |
| `seats` | Physical seats in an auditorium. `grid_row`/`grid_column` place the seat on the layout, and gaps in the grid are aisles. |
| `showtimes` | A movie playing in an auditorium at a time, in one language and format. |
| `showtime_prices` | Price per seat category for a showtime, in paise. |

## Inventory

| Table | Notes |
|---|---|
| `show_seats` | One row per seat per showtime, with status `AVAILABLE`, `HELD` or `SOLD`. Primary key is `(showtime_id, seat_id)`. |

Inventory rows are created up front, when the show is created, not when
someone first picks a seat. A seat hold locks these rows with
`SELECT ... FOR UPDATE`, and you can't lock a row that doesn't exist yet.

A held seat whose `held_until` has passed is treated as available, even
before the cleanup job resets it.

## Users and reservations

| Table | Notes |
|---|---|
| `users` | Email is stored lowercased and is unique. Passwords are scrypt hashes. |
| `sessions` | Only the SHA-256 of the session token is stored. |
| `reservations` | A user's hold on seats for one show. See [reservation-lifecycle.md](reservation-lifecycle.md) for states. |
| `reservation_seats` | The seats a reservation asked for, with the price at hold time. Kept for history even after `show_seats.reservation_id` moves on. |

`show_seats.reservation_id` is the current owner of the seat.
`reservation_seats` is what each reservation asked for. They agree for live
holds, and `test/invariants.ts` checks that they do.

Money is stored as integer paise to avoid floating point issues.
All timestamps are `timestamptz`.

## Constraints

Some rules are enforced by the database, not just the API:

- `showtimes_no_overlap`: an exclusion constraint (using `btree_gist`) that
  stops two scheduled shows from overlapping in the same auditorium. Cancelled
  shows are ignored, so a slot can be reused.
- `show_seats_owner_matches_status`: a seat has a `reservation_id` exactly
  when it isn't `AVAILABLE`.
- `reservations_one_active_hold`: a partial unique index on
  `(user_id, showtime_id) WHERE status = 'HELD'`, so a user can't end up with
  two holds on the same show from two tabs.
- `reservations (user_id, idempotency_key)` is unique, which makes retried
  hold requests safe.
- `show_seats_held_until_only_when_held`: a held seat always has an expiry,
  and available or sold seats never do.
- `showtimes_ends_after_start`, `showtime_prices_positive`,
  `movies_runtime_positive`, `movies_rating_range`: basic check constraints.
- `seats (auditorium_id, row_label, number)` is unique, and so is
  `(auditorium_id, grid_row, grid_column)`, so two seats can't occupy the same
  spot.

Prisma can't express the exclusion and check constraints, so they're added as
raw SQL at the end of the init migration. Prisma ignores them when diffing,
so they don't show up as drift.

## Indexes

| Index | Why |
|---|---|
| `showtimes (movie_id, starts_at)` | Main showtime query: shows for a movie in a date range. |
| `showtimes_no_overlap` (gist) | Comes with the exclusion constraint. Also covers lookups by auditorium and time. |
| `cinemas (city_id)` | Listing cinemas in a city, and joining showtimes to a city. |
| `movies (release_date)` | Splitting "now showing" from "coming soon". |
| `show_seats (showtime_id, seat_id)` (PK) | Locking the requested seats of a show, and the availability query. |
| `show_seats (reservation_id)` | Freeing a reservation's seats on release, replacement and expiry. |
| `reservations (status, expires_at)` | The worker's scan for expired holds. |
| `reservations_one_active_hold` | Enforces one hold per user per show, and finds a user's current hold. |

The movie catalogue is small, so search and genre filters don't have dedicated
indexes yet. If the catalogue grows, a trigram index on `title` and a GIN index
on `genres` would be the next step.
