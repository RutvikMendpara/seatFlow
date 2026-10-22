# 6. Live seat updates over WebSockets, fed by Postgres LISTEN/NOTIFY

**Status:** Accepted

## Context

People looking at the same show should see seats get taken without
reloading. Seats change from several places: hold requests in any API
instance, the expiry job and reconciliation in the worker, and payment
webhooks. The UI only needs a hint. A hold request is always checked
against the database (see [ADR 1](0001-postgres-as-source-of-truth.md)).

## Decision

- A trigger on `show_seats` bumps a per-seat `version` whenever status or
  owner changes, and a statement-level trigger calls `pg_notify` with the
  changed seats (chunked to stay under the 8 KB payload limit).
- Each API instance keeps one dedicated connection on `LISTEN seat_changes`
  and forwards changes to WebSocket clients subscribed to that show.
- Clients merge updates by version and refetch the full snapshot after
  subscribing, on reconnect, when told to `resync`, and when the tab
  becomes visible. They poll every 15 seconds while the socket is down.

## Alternatives considered

- **Polling only.** Simple and stateless, but either slow to show changes or
  heavy on the API with many viewers. It's kept as the fallback.
- **Redis pub/sub, published from application code after commit.** Works
  across instances, but every code path that touches seats has to remember
  to publish, including the worker. A crash between commit and publish loses
  the update, and nothing ties the message to the transaction.
- **Server-Sent Events.** Would also work, since updates only flow one
  way. Chose WebSockets because the spec asks for them and they leave room
  for client messages like subscribe and unsubscribe.

## Consequences

- Notifications are sent only on commit, in commit order, and never for a
  rolled-back hold. Every write path is covered by the trigger, including
  ones added later.
- `NOTIFY` takes a global lock at commit. The concurrency test showed no
  measurable difference (about 1,050-1,100 req/s on the mixed scenario
  before, 1,090-1,130 after, on a laptop). Worth re-measuring if write
  volume grows by orders of magnitude.
- Versions only increase per seat, because row locks serialize updates to a
  seat. Clients can apply messages in any order and keep the newest.
- A listener that loses its connection misses notifications, so on reconnect
  it tells every client to resync. A client that loses its socket refetches
  when it reconnects. Lost or reordered messages can make the UI briefly
  stale, but never let a seat be sold twice.
- Expired holds don't cause a write until the worker frees them (up to 15
  seconds later), so they appear free to other viewers with that delay.
