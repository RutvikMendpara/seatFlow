# Payment consistency

The payment provider and our database can't share a transaction. A customer
can be charged while our process is down, a webhook can arrive twice or not
at all, and a payment can land after we've let the seats go. This doc
covers how SeatFlow keeps a consistent, explainable state anyway.

The short version:

1. A booking is only confirmed from what the **provider** says (a signed
   webhook, or the provider's API during reconciliation), never from what
   the browser says.
2. Confirmation is **one database transaction**: record the event, lock the
   payment, reservation and seats, sell the seats, create the booking and
   ticket, and queue follow-up work in the outbox.
3. Everything that talks to the provider is **safe to repeat**: our payment
   attempt id is the idempotency key for orders and refunds.
4. When money arrives and we can't give the seats, the payment becomes
   `REFUND_PENDING` and a refund is queued in the **same transaction**.
   Nothing gets silently lost.

## Pieces

| Piece | Where |
|---|---|
| Mock provider (orders, hosted checkout, signed webhooks, refunds) | `apps/payment-sim` |
| Checkout | `src/payments/checkout.service.ts` |
| Webhook endpoint | `src/payments/webhooks.controller.ts` |
| Applying an outcome (shared by webhook and reconciliation) | `src/payments/payment-outcomes.service.ts` |
| Reconciliation | `src/payments/reconciliation.service.ts` (worker, every 30s) |
| Outbox: refunds, confirmation emails | `src/outbox/` (worker, every 2s) |

## Payment states

```
CREATED ──► PENDING ──► SUCCEEDED
   │           │
   │           ├──► FAILED ─────────┐  (a "failed" payment can still turn up as paid)
   │           │                    ▼
   └───────────┴──────────────► REFUND_PENDING ──► REFUNDED
```

| State | Meaning |
|---|---|
| `CREATED` | We recorded the attempt. The provider order may or may not exist yet. |
| `PENDING` | The provider order exists and the customer is on the checkout page. |
| `SUCCEEDED` | Paid, and the booking is confirmed. |
| `FAILED` | Declined, cancelled, expired, or never reached the provider. The user can try again until the deadline. |
| `REFUND_PENDING` | Money was taken, but the booking couldn't be confirmed. `failure_reason` says why. |
| `REFUNDED` | The refund went through. |

Only one payment per reservation can be `CREATED` or `PENDING` at a time.
A partial unique index enforces this.

## Checkout

`POST /api/reservations/:id/checkout`

1. **Short transaction.** Lock the reservation, check it's still live, and
   return the in-flight payment if there is one (a double click). Otherwise,
   price the booking from `reservation_seats`, move the reservation to
   `PAYMENT_PENDING`, extend the hold to the payment deadline, and insert a
   `CREATED` attempt.
2. **Provider call, outside any transaction**, with the attempt id as the
   idempotency key and as the order reference. The order expires at our
   payment deadline.
3. Store the order id and mark the attempt `PENDING`.

If step 2 fails, the attempt stays `CREATED`. The next click reuses it, and
the provider returns the same order for the same key. If our process dies
between 2 and 3, reconciliation finds the order by reference.

The deadline is extended once, when the reservation first moves to
`PAYMENT_PENDING`. Retrying after a declined card doesn't extend it again, so
the longest anyone can hold seats is the hold time plus one payment window.

## Webhooks

`POST /api/payments/webhooks`

- The signature is HMAC-SHA256 over `timestamp.raw_body`. Timestamps more
  than 5 minutes off are rejected, which stops replays. Several `v1`
  values are accepted so the secret can be rotated.
- The provider's event id goes into `payment_events` with
  `ON CONFLICT DO NOTHING`. If nothing was inserted, it's a duplicate and we
  return `200` right away.
- The insert happens in the **same transaction** as the booking changes. If
  anything fails or the process dies partway, the event record rolls back
  too, the provider gets a non-2xx, and its retry processes the event from
  scratch. `payment-webhooks.e2e-spec.ts` forces this with a trigger that
  makes the booking insert fail.

Different event ids for the same payment (a provider resend, or a webhook
arriving after reconciliation already handled it) are caught by the
payment's own status: a payment that's already settled returns
`already_handled`.

## Confirming a payment

Locks are taken in the same order everywhere: **payment attempt →
reservation → seats sorted by id**. Hold creation and expiry also go
reservations before seats, so nothing can deadlock.

Given a successful payment, it checks in this order:

| Check | If it fails |
|---|---|
| Payment already `SUCCEEDED` / `REFUND_PENDING` / `REFUNDED` | No-op, `already_handled` |
| Amount and currency match what we asked for | Refund, `amount_mismatch` |
| Reservation not already confirmed by another payment | Refund, `already_confirmed` |
| Show hasn't started | Refund, `show_started` |
| Every seat is still ours, free, or held by an expired hold | Refund, `seats_unavailable` |

If everything passes, the seats become `SOLD`, the reservation `CONFIRMED`
and the payment `SUCCEEDED`. A booking, its seats and a ticket are created,
and `booking.confirmed` goes into the outbox.

`booking_seats` has a unique `(showtime_id, seat_id)`. Even if this code had
a bug, the database would refuse to sell a seat twice.

### When the payment arrives after the deadline

This is the case the spec specifically calls out.

Our hold ends at the payment deadline. After that, anyone can take the seats
(see [reservation-lifecycle.md](reservation-lifecycle.md)), and the
provider order expires at the same moment, so most late payments are
refused by the provider. A webhook can still be delayed, though, or a payment
can be captured right at the edge.

When a success arrives late:

- **The seats are still free** (still pointing at us, released back to
  `AVAILABLE`, or under someone else's hold that has also expired): we take
  them in the confirmation transaction and confirm. The customer paid and
  nobody else got hurt, so there's no reason to refuse.
- **Someone else holds or bought any of the seats**: the payment goes to
  `REFUND_PENDING` with `seats_unavailable`, our reservation is `EXPIRED`, any
  seats still pointing at it are freed, and a refund is queued. The other
  customer keeps their seats.

Either way, the seat is never sold twice and the payment is never lost track
of. See [ADR 4](adr/0004-expiry-during-payment.md) for why we don't just hold
seats until the provider answers.

## Reconciliation

Every 30 seconds the worker picks payments still `CREATED`/`PENDING` more
than a minute past their deadline (the minute lets in-flight webhooks land
first) and asks the provider:

| Provider says | We do |
|---|---|
| Paid | Apply it as a success, exactly as a webhook would |
| Failed / cancelled / expired | Mark the payment `FAILED` |
| Still open | Cancel the order, then apply whatever that returns |
| No order id stored | Look the order up by our reference. If none exists: `FAILED`, `never_reached_provider` |
| Unreachable | Leave it for the next run |

It then expires `PAYMENT_PENDING` reservations past their deadline that have
no payment in flight, and frees their seats.

## Refunds and emails (outbox)

Anything that has to happen after a commit and involves the outside world
is written to `outbox_events` in the same transaction as the change that
needs it. See [ADR 5](adr/0005-transactional-outbox.md).

- `payment.refund_requested` calls the provider's refund API with the key
  `refund-<payment id>`, then marks the payment `REFUNDED`.
- `booking.confirmed` sends the confirmation email. There's no email
  provider yet, so it's logged with the address masked.

Events are inserted with SQL instead of the Prisma client, so
`available_at` comes from Postgres. Prisma fills `now()` defaults from the
app server's clock, and the worker compares against the database clock, so
an app clock running ahead would delay new events.

The worker claims events by pushing `available_at` forward (a lease)
instead of holding a lock, so no transaction stays open during the provider
call. Failures retry with backoff from 10 seconds up to 10 minutes. After 10
attempts the event is `FAILED` and needs someone to look at it. Delivery is
at least once. Refunds are safe to repeat because of the idempotency key,
but a confirmation email could be sent twice in a rare crash.

## Scenarios

Each of these has an e2e test.

| Scenario | What happens | Test |
|---|---|---|
| Payment succeeds | Booking confirmed, ticket issued, email queued | `payment-webhooks` › confirms the booking |
| Payment fails | Payment `FAILED`, reservation stays payable until the deadline | `payment-webhooks` › declined payment |
| Customer closes the browser | Nothing depends on the browser. The webhook or reconciliation finishes the job | `reconciliation` › paid order whose webhook never arrived |
| Customer clicks Pay twice | Same payment returned, one provider order | `checkout` › Pay clicked repeatedly |
| Provider sends the same webhook several times | One booking, the rest are `duplicate` | `payment-webhooks` › same event delivered many times |
| Confirmation arrives late, seats free | Confirmed | `payment-webhooks` › late payment if nobody took the seats |
| Confirmation arrives late, seats taken | `REFUND_PENDING`, refund sent by the worker | `payment-webhooks` › late payment finds the seats taken, `outbox` › refunds |
| Backend crashes mid-webhook | Full rollback, the provider's retry succeeds | `payment-webhooks` › rolls back everything |
| Reservation expires with the payment unresolved | Reconciliation asks the provider, then confirms, fails or cancels | `reconciliation` (several) |
| Paid, but the booking can't legally be completed | Refund with the reason recorded | `payment-webhooks` › amount mismatch, already won |
| Provider down during checkout | `502`, attempt kept, retry reuses it | `checkout` › provider is down |
| Provider down during refund | Retried with backoff | `outbox` › retries with backoff |

You can also run the whole flow against the Docker stack with
`scripts/demo-booking.sh [normal|late|duplicate|drop]`.
