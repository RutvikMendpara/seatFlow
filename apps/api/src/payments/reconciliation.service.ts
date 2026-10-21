import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import {
  PAYMENT_GATEWAY,
  PaymentProviderError,
  type PaymentGateway,
  type ProviderOrder,
} from './gateway/payment-gateway';
import { PaymentOutcomesService, type Outcome } from './payment-outcomes.service';

const BATCH_SIZE = 50;

type OpenPayment = { id: string; provider_order_id: string | null };

// Webhooks get lost, and provider calls can succeed without us seeing the
// response. This asks the provider about every payment still open after its
// deadline and applies the answer, using the same code as the webhook.
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly graceSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly outcomes: PaymentOutcomesService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
    config: ConfigService<Env, true>,
  ) {
    this.graceSeconds = config.get('RECONCILE_GRACE_SECONDS', { infer: true });
  }

  async run(): Promise<number> {
    const resolved = await this.resolveOpenPayments();
    const expired = await this.expireAbandonedCheckouts();
    return resolved + expired;
  }

  // The grace period gives webhooks that are already on their way a chance
  // to arrive first.
  async resolveOpenPayments(): Promise<number> {
    const open = await this.prisma.$queryRaw<OpenPayment[]>`
      SELECT p.id, p.provider_order_id
      FROM payment_attempts p
      JOIN reservations r ON r.id = p.reservation_id
      WHERE p.status IN ('CREATED', 'PENDING')
        AND r.expires_at < now() - make_interval(secs => ${this.graceSeconds})
      ORDER BY p.created_at
      LIMIT ${BATCH_SIZE}
    `;

    let resolved = 0;
    for (const payment of open) {
      try {
        const outcome = await this.resolve(payment);
        this.logger.log(`Reconciled payment ${payment.id}: ${outcome}`);
        resolved++;
      } catch (err) {
        // Provider unreachable or similar. Try again on the next run.
        if (!(err instanceof PaymentProviderError)) throw err;
        this.logger.warn(`Could not reconcile payment ${payment.id}: ${err.message}`);
      }
    }
    return resolved;
  }

  private async resolve(payment: OpenPayment): Promise<Outcome> {
    let order: ProviderOrder | undefined;
    if (payment.provider_order_id) {
      order = await this.gateway.getOrder(payment.provider_order_id);
    } else {
      // We never stored an order id. The order may still exist if the
      // provider got the request but we lost the response.
      [order] = await this.gateway.findOrdersByReference(payment.id);
    }

    if (!order) {
      return this.outcomes.run((tx) =>
        this.outcomes.failed(tx, { orderId: '', reference: payment.id, reason: 'never_reached_provider' }),
      );
    }

    if (order.status === 'created') {
      // Still open on their side past our deadline. Close it so the customer
      // can't pay for seats we've let go. If they paid in the meantime the
      // cancel fails, and the next run will see the payment.
      order = await this.gateway.cancelOrder(order.id);
    }

    const current = order;
    if (current.status === 'paid' && current.paymentId) {
      return this.outcomes.run((tx) =>
        this.outcomes.succeeded(tx, {
          orderId: current.id,
          reference: current.reference,
          paymentId: current.paymentId!,
          amountPaise: current.amountPaise,
          currency: current.currency,
        }),
      );
    }
    return this.outcomes.run((tx) =>
      this.outcomes.failed(tx, {
        orderId: current.id,
        reference: current.reference,
        reason: current.failureReason ?? current.status,
      }),
    );
  }

  // Checkouts that ran out of time with no payment left in flight. The seats
  // go back on sale. A payment that turns up later still gets the seats if
  // they're free, or a refund if not.
  async expireAbandonedCheckouts(): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ expired: number }[]>`
      WITH stale AS (
        SELECT r.id FROM reservations r
        WHERE r.status = 'PAYMENT_PENDING'
          AND r.expires_at < now() - make_interval(secs => ${this.graceSeconds})
          AND NOT EXISTS (
            SELECT 1 FROM payment_attempts p
            WHERE p.reservation_id = r.id AND p.status IN ('CREATED', 'PENDING')
          )
        ORDER BY r.expires_at
        LIMIT 500
        FOR UPDATE SKIP LOCKED
      ),
      expired AS (
        UPDATE reservations r SET status = 'EXPIRED', updated_at = now()
        FROM stale WHERE r.id = stale.id
        RETURNING r.id
      ),
      freed AS (
        UPDATE show_seats
        SET status = 'AVAILABLE', reservation_id = NULL, held_until = NULL, updated_at = now()
        WHERE reservation_id IN (SELECT id FROM expired) AND status = 'HELD'
      )
      SELECT count(*)::int AS expired FROM expired
    `;
    return row?.expired ?? 0;
  }
}
