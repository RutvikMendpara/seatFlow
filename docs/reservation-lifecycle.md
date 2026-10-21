# Reservation lifecycle

This covers how a user goes from picking seats to holding them, and how holds
end. Payment and confirmation come in a later milestone and will extend this
doc.

## States

```
                 release / pick again
        ┌──────────────────────────────────► CANCELLED
        │
   ── HELD ──────────────────────────────────► EXPIRED
        │        hold passes expires_at
        │
        └──► PAYMENT_PENDING ──► CONFIRMED        (not built yet)
```

| State | Meaning |
|---|---|
| `HELD` | Seats are held for this user until `expires_at` (10 minutes by default). |
| `EXPIRED` | The hold ran out. Its seats are free again. |
| `CANCELLED` | The user released the hold or picked different seats. |
| `PAYMENT_PENDING`, `CONFIRMED` | Reserved for the payment flow. |

A `HELD` reservation whose `expires_at` has passed is reported as `EXPIRED` by
the API straight away. The database row is updated later by the worker.

Seat state is tracked separately in `show_seats`:

| Seat status | `reservation_id` | `held_until` |
|---|---|---|
| `AVAILABLE` | null | null |
| `HELD` | the holding reservation | set |
| `SOLD` | the reservation | null |

Check constraints enforce these combinations.

## Holding seats

`POST /api/reservations` with `{ showtimeId, seatIds }` and an optional
`Idempotency-Key` header. All of this runs in one transaction:

1. Read `now()` once. Postgres keeps it fixed for the whole transaction, so all
   expiry checks and the new deadline use the same database clock, not the
   app server's.
2. Check the show is scheduled and hasn't started.
3. Lock the user's current `HELD` reservation for this show, if they have one
   (`FOR UPDATE`). Picking seats again replaces it.
4. Lock the requested seats, plus the seats of that previous hold, with
   `SELECT ... FOR UPDATE ORDER BY seat_id`.
5. A seat can be taken if it's `AVAILABLE`, if its hold has expired, or if it
   belongs to the user's previous hold. If any requested seat fails this, the
   request returns `409` with `unavailableSeatIds` and the transaction rolls
   back, so nothing is held.
6. Cancel the previous hold and free any of its seats that weren't asked for
   again.
7. Look up prices from `showtime_prices`. The client never sends prices.
8. Insert the reservation and its `reservation_seats`, then point the seats at it.

### Lock ordering

Every code path locks rows in the same order: reservation rows first, then
seat rows sorted by `seat_id`. Two requests for overlapping seats always
queue on the same first seat instead of each holding a seat the other needs,
so they can't deadlock. The concurrency tests fail on any `500`, which is how
a deadlock would show up.

The hold path never locks *other* users' reservations, even when it takes
over seats from an expired one. That's left to the worker, which keeps the
lock order intact.

## Ending a hold

- **Release:** `DELETE /api/reservations/:id` locks the reservation, marks it
  `CANCELLED`, and frees only the seats that still point at it. Releasing
  twice is fine.
- **Expiry:** the worker (`pnpm start:worker`) runs every 15 seconds. In one
  statement, it marks up to 500 expired holds as `EXPIRED` and frees their
  seats. It uses `FOR UPDATE SKIP LOCKED` so it never waits on a hold that a
  request is working on.

The worker is cleanup, not part of correctness. If it stops, expired seats
are still bookable, because step 5 treats an expired hold as free.

## Idempotency

Clients should send an `Idempotency-Key` header, unique per seat selection,
so a retry after a timeout doesn't create a second hold.

- Same key with the same show and seats: the original reservation is returned.
- Same key with a different request: `422`.
- Two requests with the same key arriving together: one creates the hold, and
  the other hits the unique index on `(user_id, idempotency_key)` and returns
  that same hold.

## Errors

| Status | When |
|---|---|
| `400` | Bad input, seats from another auditorium, more than 10 seats |
| `401` | Not signed in |
| `404` | Unknown show, or a reservation that isn't yours |
| `409` | Seats taken (`unavailableSeatIds` lists them), show already started, or a hold already being made in another tab |
| `422` | Idempotency key reused for a different request |
| `503` | Couldn't get a database connection in time. Safe to retry with the same key. |

## Guarantees so far

| Guarantee | How |
|---|---|
| Two requests can't both get the same seat | Row locks on `show_seats`, with availability checked after the lock |
| Multi-seat holds are all or nothing | Single transaction, rolled back on any conflict |
| Expired holds can't be extended or reused by their owner | Expiry checked against database time; expired holds are treated as gone |
| Retries don't create duplicate holds | Idempotency key with a unique index |
| One active hold per user per show | Partial unique index `reservations_one_active_hold` |

The concurrency tests in [testing.md](testing.md) check these against the
database after every run.
