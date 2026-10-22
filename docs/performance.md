# Performance

One measured optimization, with the method so it can be repeated. The
point isn't the absolute numbers (this is a laptop), but finding the
bottleneck, changing one thing, and showing the effect without losing
correctness.

## Setup

- Apple M4 (10 cores, 24 GB), Postgres 18 in Docker (7 CPUs)
- API: production build (`node dist/main.js`), one instance, DB pool of 10
- Load: [k6](https://k6.io) from `apps/api/load/holds.js`, 1,000 virtual
  users each sending one hold request at the same moment against a fresh
  50-seat show
- After every run, `load/verify.ts` checks the booking invariants (no seat
  with two live owners, no orphaned holds)

```bash
cd apps/api
pnpm build && PORT=4300 node dist/main.js &          # plus the usual env vars
pnpm exec tsx load/prepare.ts 1000 50                # fresh show and users
k6 run -e SCENARIO=hot -e API_URL=http://localhost:4300 load/holds.js
pnpm exec tsx load/verify.ts
```

Scenarios:

- **hot:** all 1,000 users want the same two seats. One wins, 999 get `409`.
- **mixed:** each user wants 1-4 adjacent seats, spread over the show.

## The bottleneck

Every hold ran the full locked path: begin a transaction, check the show,
lock the user's previous hold, `SELECT ... FOR UPDATE` the seats, then
commit or roll back. That's about five round trips holding one of the 10
pooled connections.

On a contested seat, almost every request loses, but each loser still went
through all of that. Worse, they queued on the same row lock one at a time,
just to find out the seat was already taken. With 10 connections, the pool
was mostly busy saying no.

## The change

A lock-free fast path before the transaction
(`ReservationsService.create`): one plain `SELECT` checks whether any
requested seat is sold, or held by someone else with a live hold. If so, it
returns `409` right away, without a transaction or locks.

It doesn't change correctness. The check runs without locks, so a seat it
sees as free can be taken a moment later. Anything that passes still goes
through the full locked check in `holdSeats`. The fast path can only answer
"taken" earlier. It can never let a request through that the locked path
would refuse.

## Results

Each scenario was run three times on a fresh show. The first mixed run
after starting the API is a cold start (JIT warm-up, opening pool
connections) and is shown separately.

| Scenario | Before: req/s | Before: p95 | After: req/s | After: p95 |
|---|---|---|---|---|
| hot, run 1 | 2,068 | 327 ms | 3,271 | 220 ms |
| hot, run 2 | 2,043 | 379 ms | 3,407 | 191 ms |
| hot, run 3 | 2,057 | 341 ms | 4,047 | 188 ms |
| mixed, run 2 | 2,194 | 365 ms | 3,016 | 241 ms |
| mixed, run 3 | 2,249 | 300 ms | 2,828 | 303 ms |
| mixed, cold start | 1,560 | 383 ms | 916 | 319 ms |

Taking the median:

- **hot:** 2,057 → 3,407 req/s (**+66%**), p95 341 → 191 ms (**−44%**)
- **mixed:** about 2,220 → 2,920 req/s (**+32%**), p95 about 330 → 270 ms (**−18%**)

Every run passed the invariant check, and the e2e suite passes with the
change. The gain is biggest when contention is worst, which is when it
matters: a popular show going on sale.

## What's next

- **Session lookup.** Every request still does one query to check the
  session token. Caching sessions for a few seconds would save a round trip
  per request.
- **Pool size versus Postgres.** Throughput is still bounded by connection
  time. More API instances, each with its own pool, would scale reads.
  Writes to one show would still serialize on its row locks, which is
  intended.
- **Earlier experiment.** Adding the `pg_notify` trigger (ADR 6) made no
  measurable difference to throughput (see the ADR).

## Limitations

- These are laptop numbers with the database in Docker and k6 on the same
  machine. They show relative change, not production capacity.
- Three runs per scenario. The variation between runs (10-20%) is large
  compared to some of the differences, which is why only the big effects
  are claimed.
- One API instance. Rate-limit counters are in memory, so multiple instances
  would each count separately.
