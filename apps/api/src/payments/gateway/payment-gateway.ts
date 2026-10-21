export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');

export type ProviderOrderStatus = 'created' | 'paid' | 'failed' | 'cancelled' | 'expired';

export type ProviderOrder = {
  id: string;
  status: ProviderOrderStatus;
  amountPaise: number;
  currency: string;
  reference: string;
  paymentId: string | null;
  failureReason: string | null;
  checkoutUrl: string;
};

export type CreateOrderInput = {
  amountPaise: number;
  currency: string;
  // Our payment attempt id, so orders can be found again if we lose the response.
  reference: string;
  expiresAt: Date;
  returnUrl: string;
};

// Network errors, timeouts and 5xx from the provider. The call may or may
// not have gone through, so callers must be safe to retry.
export class PaymentProviderError extends Error {}

export interface PaymentGateway {
  createOrder(input: CreateOrderInput, idempotencyKey: string): Promise<ProviderOrder>;
  getOrder(orderId: string): Promise<ProviderOrder>;
  findOrdersByReference(reference: string): Promise<ProviderOrder[]>;
  cancelOrder(orderId: string): Promise<ProviderOrder>;
  refund(paymentId: string, amountPaise: number, idempotencyKey: string): Promise<{ id: string }>;
}
