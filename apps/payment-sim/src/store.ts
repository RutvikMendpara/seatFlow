import { randomBytes } from 'node:crypto';

export type OrderStatus = 'created' | 'paid' | 'failed' | 'cancelled' | 'expired';

export type Order = {
  id: string;
  amount: number;
  currency: string;
  reference: string;
  status: OrderStatus;
  paymentId: string | null;
  failureReason: string | null;
  refundedAmount: number;
  returnUrl: string | null;
  expiresAt: Date;
  createdAt: Date;
};

export type Refund = {
  id: string;
  paymentId: string;
  amount: number;
  status: 'succeeded';
  createdAt: Date;
};

// Everything lives in memory. Restarting the simulator forgets all orders,
// which is fine for local testing.
export const orders = new Map<string, Order>();
export const refunds = new Map<string, Refund>();

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}

// An unpaid order stops accepting payment once it expires.
export function currentStatus(order: Order): OrderStatus {
  if (order.status === 'created' && order.expiresAt.getTime() <= Date.now()) {
    order.status = 'expired';
  }
  return order.status;
}

export function orderJson(order: Order, publicUrl: string) {
  return {
    id: order.id,
    amount: order.amount,
    currency: order.currency,
    reference: order.reference,
    status: currentStatus(order),
    paymentId: order.paymentId,
    failureReason: order.failureReason,
    refundedAmount: order.refundedAmount,
    expiresAt: order.expiresAt.toISOString(),
    createdAt: order.createdAt.toISOString(),
    checkoutUrl: `${publicUrl}/checkout/${order.id}`,
  };
}
