# 1. PostgreSQL is the source of truth for seat ownership

**Status:** Accepted

## Context

Seat ownership is the one thing the system can't get wrong. Redis is in the
stack and is often used for seat locks in booking systems, because `SET NX
PX` is fast and expires on its own.

## Decision

Seat ownership lives only in Postgres: `show_seats` plus `reservations`.
Holds are made with row locks inside a transaction. Redis may be used later
for caching and for pushing availability updates, but nothing reads Redis to
decide whether a seat can be sold.

## Alternatives considered

- **Redis locks, then write to Postgres.** Fast, but you end up with two
  systems that have to agree. A Redis failover can lose a lock that was just
  granted, and a process pausing between taking the Redis lock and writing to
  Postgres can let a lock expire while it still thinks it owns the seat.
  Fixing those means fencing tokens checked in Postgres anyway.
- **Redis only.** Seats would need to survive Redis restarts, and later
  payment confirmation needs to update seats and payments atomically, which
  Redis can't do together with Postgres.

## Consequences

- Every hold is a Postgres transaction, so Postgres sets the throughput limit
  for holds. The concurrency tests handle about 1,100-1,450 hold requests per
  second on a laptop with the database in Docker, which is plenty for this
  project.
- Correctness can be checked with SQL alone. `test/invariants.ts` does that.
- If Redis goes down, the worst outcome is stale availability on screen. The
  hold request will still be rejected correctly.
