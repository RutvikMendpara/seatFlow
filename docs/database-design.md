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

Money is stored as integer paise to avoid floating point issues.
All timestamps are `timestamptz`.

## Constraints

Some rules are enforced by the database, not just the API:

- `showtimes_no_overlap`: an exclusion constraint (using `btree_gist`) that
  stops two scheduled shows from overlapping in the same auditorium. Cancelled
  shows are ignored, so a slot can be reused.
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

The movie catalogue is small, so search and genre filters don't have dedicated
indexes yet. If the catalogue grows, a trigram index on `title` and a GIN index
on `genres` would be the next step.
