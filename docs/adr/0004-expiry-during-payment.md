# 4. A payment window with late payments re-checked, not indefinite holds

**Status:** Accepted

## Context

Once a customer goes to the provider's checkout page, we can't know when or
whether they'll pay. We have to decide how long their seats stay held, and
what happens when a payment arrives after that.

## Decision

- Going to checkout extends the hold once, by a fixed payment window (10
  minutes). The provider order expires at the same moment.
- After the deadline the seats are free for anyone, the same as any expired
  hold.
- A payment that arrives late re-checks the seats under lock. If they're
  still free, the booking goes through. If anyone else has them, the payment
  is refunded through the outbox.

## Alternatives considered

- **Hold the seats until the provider gives a final answer.** No refunds for
  this case, but a customer who wanders off, or a provider outage, would lock
  seats for an unbounded time. On a busy show that's worse for everyone else
  than an occasional refund.
- **Always refund late payments.** Simpler to explain, but it refunds people
  whose seats are sitting there unsold, which is a bad experience for no gain.
- **Let the deadline move with each payment attempt.** Lets one customer keep
  retrying cards and hold seats indefinitely.

## Consequences

- The longest anyone can hold seats is known: the hold time plus one payment window.
- Late payments need refund handling, which is built and tested
  (`REFUND_PENDING` and the outbox refund handler).
- Because the provider order expires with our deadline, late payments mostly
  come from delayed webhooks, not late customers.
