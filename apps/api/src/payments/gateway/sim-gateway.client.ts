import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import {
  PaymentProviderError,
  type CreateOrderInput,
  type PaymentGateway,
  type ProviderOrder,
} from './payment-gateway';

type SimOrder = {
  id: string;
  status: ProviderOrder['status'];
  amount: number;
  currency: string;
  reference: string;
  paymentId: string | null;
  failureReason: string | null;
  checkoutUrl: string;
};

const TIMEOUT_MS = 5_000;

function toOrder(o: SimOrder): ProviderOrder {
  return {
    id: o.id,
    status: o.status,
    amountPaise: o.amount,
    currency: o.currency,
    reference: o.reference,
    paymentId: o.paymentId,
    failureReason: o.failureReason,
    checkoutUrl: o.checkoutUrl,
  };
}

// Client for apps/payment-sim. A real provider would get its own class
// implementing the same interface.
@Injectable()
export class SimGatewayClient implements PaymentGateway {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('PAYMENT_PROVIDER_URL', { infer: true });
    this.apiKey = config.get('PAYMENT_API_KEY', { infer: true });
  }

  async createOrder(input: CreateOrderInput, idempotencyKey: string) {
    const order = await this.request<SimOrder>('POST', '/v1/orders', {
      body: {
        amount: input.amountPaise,
        currency: input.currency,
        reference: input.reference,
        expiresAt: input.expiresAt.toISOString(),
        returnUrl: input.returnUrl,
      },
      idempotencyKey,
    });
    return toOrder(order);
  }

  async getOrder(orderId: string) {
    return toOrder(await this.request<SimOrder>('GET', `/v1/orders/${encodeURIComponent(orderId)}`));
  }

  async findOrdersByReference(reference: string) {
    const res = await this.request<{ data: SimOrder[] }>(
      'GET',
      `/v1/orders?reference=${encodeURIComponent(reference)}`,
    );
    return res.data.map(toOrder);
  }

  async cancelOrder(orderId: string) {
    return toOrder(
      await this.request<SimOrder>('POST', `/v1/orders/${encodeURIComponent(orderId)}/cancel`),
    );
  }

  async refund(paymentId: string, amountPaise: number, idempotencyKey: string) {
    return this.request<{ id: string }>('POST', '/v1/refunds', {
      body: { paymentId, amount: amountPaise },
      idempotencyKey,
    });
  }

  private async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; idempotencyKey?: string } = {},
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          ...(options.idempotencyKey && { 'idempotency-key': options.idempotencyKey }),
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      throw new PaymentProviderError(`${method} ${path} failed: ${(err as Error).message}`);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new PaymentProviderError(`${method} ${path} returned ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }
}
