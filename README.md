# SeatFlow

A movie ticket booking platform: browse movies, pick a showtime, choose seats and check out.
The main focus is booking correctness: no seat gets sold twice, even with many people
trying to book the same show at once.

Work in progress.

## Stack

- **Web:** Next.js 16, React 19, Tailwind CSS 4
- **API:** NestJS 12, Prisma 7
- **Data:** PostgreSQL 18 (source of truth), Redis 8

## Running locally

You need Docker. pnpm is only needed if you want to run things outside Docker.

```bash
cp .env.example .env
docker compose up --build --watch
```

Then, in another terminal, load the sample data:

```bash
docker compose exec api pnpm db:seed
```

| Service | URL |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:4000/api |
| Postgres | localhost:5433 |
| Redis | localhost:6379 |

`--watch` syncs source changes into the containers, so both apps hot reload.
Migrations run automatically when the API container starts.

## Tests

The API tests need Postgres running (`docker compose up -d postgres`).
E2E tests use a separate `seatflow_test` database that gets created and seeded automatically.

```bash
cd apps/api
pnpm install
pnpm test        # unit tests
pnpm test:e2e    # API tests against Postgres
```

## Docs

- [Database design](docs/database-design.md)
