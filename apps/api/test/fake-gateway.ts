import { randomBytes } from 'node:crypto';
import {
  PaymentProviderError,
  type CreateOrderInput,
  type PaymentGateway,
  type ProviderOrder,
} from '../src/payments/gateway/payment-gateway';

const id = (prefix: string) => `${prefix}_${randomBytes(6).toString('hex')}`;

// In-memory provider for tests. Tests decide what the customer did and
// whether the provider is reachable.
export class FakeGateway implements PaymentGateway {
  readonly orders = new Map<string, ProviderOrder & { expiresAt: Date }>();
  readonly refunds: { id: string; paymentId: string; amountPaise: number; key: string }[] = [];
  createOrderCalls = 0;
  down = false;
  private readonly byKey = new Map<string, string>();

  async createOrder(input: CreateOrderInput, idempotencyKey: string) {
    this.createOrderCalls++;
    this.check();
    const existing = this.byKey.get(idempotencyKey);
    if (existing) return this.orders.get(existing)!;

    const order = {
      id: id('order'),
      status: 'created' as const,
      amountPaise: input.amountPaise,
      currency: input.currency,
      reference: input.reference,
      paymentId: null,
      failureReason: null,
      checkoutUrl: 'http://payments.invalid/checkout',
      expiresAt: input.expiresAt,
    };
    this.orders.set(order.id, order);
    this.byKey.set(idempotencyKey, order.id);
    return order;
  }

  async getOrder(orderId: string) {
    this.check();
    const order = this.orders.get(orderId);
    if (!order) throw new PaymentProviderError('not found');
    return order;
  }

  async findOrdersByReference(reference: string) {
    this.check();
    return [...this.orders.values()].filter((o) => o.reference === reference);
  }

  async cancelOrder(orderId: string) {
    this.check();
    const order = this.orders.get(orderId)!;
    if (order.status === 'paid') throw new PaymentProviderError('already paid');
    if (order.status === 'created') order.status = 'cancelled';
    return order;
  }

  async refund(paymentId: string, amountPaise: number, key: string) {
    this.check();
    const existing = this.refunds.find((r) => r.key === key);
    if (existing) return { id: existing.id };
    const refund = { id: id('rfnd'), paymentId, amountPaise, key };
    this.refunds.push(refund);
    return { id: refund.id };
  }

  // What the customer does on the checkout page.
  pay(orderId: string) {
    const order = this.orders.get(orderId)!;
    order.status = 'paid';
    order.paymentId = id('pay');
    return order;
  }

  decline(orderId: string) {
    const order = this.orders.get(orderId)!;
    order.status = 'failed';
    order.failureReason = 'card_declined';
    return order;
  }

  private check() {
    if (this.down) throw new PaymentProviderError('provider is down');
  }
}
