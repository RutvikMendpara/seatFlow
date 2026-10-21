# 2. Pessimistic row locks for seat holds

**Status:** Accepted

## Context

Many users ask for overlapping seats at the same moment when popular shows go
on sale. A hold covers several seats and has to be all or nothing.

## Decision

Lock the requested `show_seats` rows with `SELECT ... FOR UPDATE`, sorted by
`seat_id`, check availability after the lock, then update. The transaction
runs at `READ COMMITTED`.

## Alternatives considered

- **Optimistic concurrency** (a version column, or a conditional
  `UPDATE ... WHERE status = 'AVAILABLE'` and checking the row count). No lock
  waits, but under heavy contention most attempts fail and get retried, and a
  multi-seat request needs care to roll back partial updates. Because one
  request locks a handful of seats for a few milliseconds, waiting is cheap
  compared to retrying.
- **`SERIALIZABLE` isolation.** Correct without explicit locks, but conflicts
  show up as serialization failures that have to be retried, and it's harder to
  reason about which rows conflict.
- **Unique index on active seat holds.** Simple for "one owner per seat", but
  "active" depends on expiry time, and a partial index can't use `now()`.

## Consequences

- Sorting by `seat_id` gives every transaction the same lock order, so
  overlapping requests queue instead of deadlocking.
- Requests for a contested seat wait for the current holder's transaction
  before getting their 409. Under heavy contention this shows up as queueing
  latency (see [testing.md](../testing.md)). `FOR UPDATE NOWAIT` would fail
  them faster, at the cost of occasionally rejecting a request whose seat was
  about to be freed by a rollback. That's worth measuring before switching.
- Expiry is checked inside the lock against database time, so an expired hold
  can be taken over without waiting for the cleanup job.
