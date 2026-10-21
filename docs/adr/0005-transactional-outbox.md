# 5. Transactional outbox in Postgres, polled by the worker

**Status:** Accepted

## Context

Some work has to happen after a transaction commits and involves another
system: refunding through the payment provider, emailing the customer. If
the process dies between the commit and the call, the work must still
happen. If the call fails, it has to be retried.

## Decision

Write an `outbox_events` row in the same transaction as the change that
needs the work. The worker polls for due events, claims a batch by pushing
`available_at` forward (a lease), runs the handler, and marks it done.
Failures back off and eventually stop at `FAILED`.

## Alternatives considered

- **Call the provider or queue right after commit.** If the process dies in
  between, the refund is lost and nothing records that it was owed.
- **Publish to BullMQ (Redis) inside the transaction.** Redis isn't part of
  the Postgres transaction, so a job can be published for a change that then
  rolls back, or the commit succeeds and the publish fails. You'd still need
  an outbox to fix that. BullMQ could later sit behind the outbox as the
  delivery mechanism if polling becomes a bottleneck.
- **Hold a row lock on the event while the handler runs.** Simpler claiming,
  but it keeps a transaction and connection open during a network call to
  the provider.

## Consequences

- If the change committed, the event exists. If it rolled back, the event
  doesn't. There's no window where one is true without the other.
- Delivery is at least once, so handlers must be idempotent. Refunds use
  `refund-<payment id>` as the provider idempotency key. A confirmation
  email could be duplicated in a rare crash, which is acceptable.
- There's up to a 2 second delay (the poll interval) before work starts.
  That's fine for refunds and emails.
- Postgres does the queueing, so there's one less thing to run and monitor.
  Redis stays unused for now.
