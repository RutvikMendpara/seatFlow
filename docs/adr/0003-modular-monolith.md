# 3. Modular monolith with a separate worker process

**Status:** Accepted

## Context

The system has a few clear areas: catalogue, showtimes and inventory,
reservations, auth, and later payments and tickets. Booking a seat touches
inventory and reservations in the same transaction.

## Decision

One NestJS codebase with a module per area, deployed as two processes from
the same image:

- `api`: the HTTP API
- `worker`: background jobs, currently hold expiry

## Alternatives considered

- **Microservices** (inventory, booking, payments as separate services). The
  booking transaction would span service boundaries, needing sagas or
  distributed locks for something one Postgres transaction already does. That
  adds network hops, more deployments and more failure modes, without a
  scaling problem that requires them.
- **Running jobs inside the API process.** Simpler, but every API instance
  would run the jobs, and a slow job would compete with request handling.
  A separate process can be restarted and scaled on its own.

## Consequences

- The reservation logic stays in one transaction, which is the main reason
  for this choice.
- Modules share one database. Boundaries are kept by convention: modules talk
  through services, not each other's tables. The exception is reservations
  reading `showtime_prices`, which is deliberate so pricing happens inside the
  booking transaction.
- If a module ever needs to be split out, the module boundaries are where to
  cut.
