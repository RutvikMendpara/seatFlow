# SeatFlow

A movie ticket booking platform: browse movies, pick a showtime, choose seats and check out.
The main focus is booking correctness: no seat gets sold twice, even with many people
trying to book the same show at once.

Work in progress.

## Stack

- **Web:** Next.js 16, React 19, Tailwind CSS 4
- **API:** NestJS 12, Prisma 7, plus a worker process for background jobs
- **Payments:** a mock provider (`apps/payment-sim`) with hosted checkout and signed webhooks
- **Data:** PostgreSQL 18 (source of truth), Redis 8 (running, not used yet)

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
| Payment simulator | http://localhost:4100 |
| Redis | localhost:6379 |

The `worker` service runs background jobs: expiring stale holds, reconciling
payments with the provider, and processing the outbox (refunds, emails).

To book a ticket end to end from the command line:

```bash
set -a; . ./.env; set +a
./scripts/demo-booking.sh
```

`--watch` syncs source changes into the containers, so both apps hot reload.
Migrations run automatically when the API container starts.

## Tests

The API tests need Postgres running (`docker compose up -d postgres`).
E2E tests use a separate `seatflow_test` database that gets created and seeded automatically.

```bash
cd apps/api
pnpm install
pnpm test              # unit tests
pnpm test:e2e          # API tests against Postgres
pnpm test:concurrency  # 1000 clients competing for 50 seats
```

Browser tests run against the Docker stack:

```bash
cd apps/web
pnpm install
pnpm exec playwright install chromium
pnpm test:e2e
```

See [docs/testing.md](docs/testing.md) for what each suite checks and the
measured concurrency results.

## Docs

- [Database design](docs/database-design.md)
- [Reservation lifecycle](docs/reservation-lifecycle.md)
- [Payment consistency](docs/payment-consistency.md)
- [Frontend](docs/frontend.md): booking flow, live seats, accessibility
- [Security](docs/security.md)
- [Performance](docs/performance.md): k6 load test and one measured optimization
- [Testing](docs/testing.md)
- Architecture decisions:
  [Postgres as source of truth](docs/adr/0001-postgres-as-source-of-truth.md),
  [row locks](docs/adr/0002-row-locks-over-optimistic-concurrency.md),
  [modular monolith](docs/adr/0003-modular-monolith.md),
  [expiry during payment](docs/adr/0004-expiry-during-payment.md),
  [transactional outbox](docs/adr/0005-transactional-outbox.md),
  [live seat updates](docs/adr/0006-live-seats-websocket-notify.md)
