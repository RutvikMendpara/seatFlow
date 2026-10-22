# Testing

All API tests run against a real Postgres. Concurrency bugs don't show up
against mocks.

```bash
docker compose up -d postgres
cd apps/api
pnpm test              # unit tests
pnpm test:e2e          # everything below, against seatflow_test
pnpm test:concurrency  # just the concurrency suite
```

The e2e setup creates `seatflow_test` if it's missing, applies migrations and
re-seeds the catalogue. The payment provider is replaced with an in-memory fake
(`test/fake-gateway.ts`), and tests sign their own webhooks with the test
secret. The worker's jobs are called directly, not on a timer. Tests that change inventory create their own cinema and
show through `test/fixtures.ts`, so they don't affect each other.

## Suites

| File | Covers |
|---|---|
| `catalogue.e2e-spec.ts` | Movie listing, filters, facets, search |
| `showtimes.e2e-spec.ts` | Showtimes by day, seat layout, availability |
| `auth.e2e-spec.ts` | Register, login, logout, cookie flags, bearer tokens |
| `reservations.e2e-spec.ts` | Holds, conflicts, all-or-nothing, replacing a hold, release, expiry takeover, idempotency, validation |
| `hold-expiry.e2e-spec.ts` | The expiry worker, including not freeing seats someone else already took over |
| `concurrency.e2e-spec.ts` | Many clients competing for the same seats |
| `checkout.e2e-spec.ts` | Server-side pricing, payment window, double clicks, provider down |
| `payment-webhooks.e2e-spec.ts` | Signatures, duplicates, declines, late payments, refunds, a forced crash mid-webhook |
| `outbox.e2e-spec.ts` | Refunds and emails from the outbox, retries, backoff, giving up, redelivery |
| `reconciliation.e2e-spec.ts` | Dropped webhooks, abandoned checkouts, provider outages, lost order ids |
| `tickets.e2e-spec.ts` | Booking history, QR codes, check-in, forged tickets, simultaneous scans |
| `security.e2e-spec.ts` | Price tampering, SQL in search, sign-in and hold rate limits, security headers |

## Concurrency test

The concurrency test starts the API on a real port and sends every hold
request at once through `fetch`. There are two scenarios:

- **mixed:** each client asks for 1-4 adjacent seats in a random row.
- **hot-seat:** every client asks for the same two seats.

After each run it checks:

- every response is `201`, `409` or `503` (a `500` would mean a deadlock or a bug)
- each winner got exactly the seats it asked for
- no seat went to two winners
- the number of held seats and live reservations in the database matches what clients were told
- `test/invariants.ts` finds no seat with two live owners, no held seat without
  a matching reservation, and no live reservation missing one of its seats

Settings are read from env vars:

| Variable | Default |
|---|---|
| `CONCURRENCY_CLIENTS` | 1000 |
| `CONCURRENCY_SEATS` | 50 |
| `CONCURRENCY_SEED` | 1 (which seats each client asks for) |
| `CONCURRENCY_CONNECTIONS` | 256 (client sockets; more requests queue on the client) |
| `DB_POOL_SIZE` | 10 |

```bash
CONCURRENCY_CLIENTS=3000 CONCURRENCY_SEATS=200 DB_POOL_SIZE=20 pnpm test:concurrency
```

Each run writes its summary to `test-results/concurrency-<scenario>.json`.

### Results

Measured on an Apple M4 (10 cores, 24 GB) running Node 24 on the host and
Postgres 18 in Docker (7 CPUs), with the API and the load generator in the
same process. Latency includes time spent queued behind other requests. These
are single runs on a laptop, meant to show the invariants hold under load, not
to be a capacity number.

| Clients | Seats | Pool | Scenario | Wall time | Req/s | 201 | 409 | Seats held | p95 latency |
|---|---|---|---|---|---|---|---|---|---|
| 1000 | 50 | 10 | mixed | 910 ms | 1099 | 33 | 967 | 49 | 861 ms |
| 1000 | 50 | 10 | hot-seat | 689 ms | 1451 | 1 | 999 | 2 | 652 ms |
| 3000 | 200 | 10 | mixed | 2399 ms | 1251 | 124 | 2876 | 200 | 2270 ms |
| 3000 | 200 | 10 | hot-seat | 2154 ms | 1393 | 1 | 2999 | 2 | 2049 ms |
| 5000 | 50 | 20 | mixed | 4084 ms | 1224 | 34 | 4966 | 50 | 3824 ms |
| 5000 | 50 | 20 | hot-seat | 3581 ms | 1396 | 1 | 4999 | 2 | 3386 ms |

All runs passed every invariant check, with no `500` or `503` responses.
Runs with a pool of 2 and 30 connections passed too.

Things worth noting:

- The mixed scenario sometimes leaves one seat unsold. That's expected: the
  last free seat can sit between two held ones, and no request asks for exactly
  that one seat.
- A bigger pool doesn't speed things up much. Most of the time goes to
  requests waiting for row locks on the same few seats, not to waiting for a
  connection. Failing fast on contested seats (`FOR UPDATE NOWAIT`) and
  caching session lookups are the obvious things to measure next.
- Opening thousands of sockets at once overflows the server's accept backlog,
  and you get connection resets. That's why the test caps client connections.

## Web app

```bash
cd apps/web
pnpm test       # Vitest unit tests for pure helpers
pnpm test:e2e   # Playwright, against the running Docker stack
```

| Spec | Covers |
|---|---|
| `booking-journey.spec.ts` | Picking seats with mouse and keyboard, signing up mid-flow, checkout, paying on the simulator, the ticket. Runs on desktop and a Pixel 7, and checks the phone layout never scrolls sideways. |
| `payment-failures.spec.ts` | A declined payment and retry, a late webhook, changing seats |
| `live-seats.spec.ts` | Two browsers on one show, and catching up after the socket drops |
| `accessibility.spec.ts` | axe (WCAG 2.2 AA) on home, movie, seat map, checkout and sign in |

The suite passes repeatedly with `--repeat-each=3 --workers=4`. Getting
there turned up three real bugs: clicks lost before hydration, seat labels
widening the page on phones, and several accessibility failures. See
[frontend.md](frontend.md).

## End-to-end demo

With the Docker stack running and seeded, this books two seats through the
real simulator, waits for the webhook, fetches the ticket, and checks it in:

```bash
set -a; . ./.env; set +a
./scripts/demo-booking.sh            # webhook delivered normally
./scripts/demo-booking.sh duplicate  # delivered three times at once
./scripts/demo-booking.sh drop       # never delivered; reconciliation confirms it
```

`drop` only confirms after the payment deadline plus the reconciliation grace
period, so it takes about 11 minutes with the default settings.
