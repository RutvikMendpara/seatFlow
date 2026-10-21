# SeatFlow

A movie ticket booking platform: browse movies, pick a showtime, choose seats and check out.
The main focus is booking correctness: no seat gets sold twice, even with many people
trying to book the same show at once.

Work in progress.

## Running locally

You need Docker and pnpm.

```bash
cp .env.example .env
docker compose up -d postgres redis
```

Postgres is exposed on `localhost:5433` and Redis on `localhost:6379`.
