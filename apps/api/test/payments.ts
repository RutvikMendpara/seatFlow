import { INestApplication } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import request from 'supertest';
import type { ProviderOrder } from '../src/payments/gateway/payment-gateway';
import { fakeGateway } from './create-app';
import type { TestUser } from './fixtures';

const SECRET = 'whsec_test_for_e2e_tests';

export function webhookEvent(order: ProviderOrder, overrides: Record<string, unknown> = {}) {
  return {
    id: `evt_${randomBytes(6).toString('hex')}`,
    type: order.status === 'paid' ? 'payment.succeeded' : 'payment.failed',
    createdAt: new Date().toISOString(),
    data: {
      orderId: order.id,
      reference: order.reference,
      paymentId: order.paymentId,
      amount: order.amountPaise,
      currency: order.currency,
      status: order.status,
      failureReason: order.failureReason,
    },
    ...overrides,
  };
}

export function sendWebhook(
  app: INestApplication,
  event: object,
  options: { secret?: string; timestamp?: number } = {},
) {
  const body = JSON.stringify(event);
  const t = options.timestamp ?? Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', options.secret ?? SECRET).update(`${t}.${body}`).digest('hex');
  return request(app.getHttpServer())
    .post('/api/payments/webhooks')
    .set('content-type', 'application/json')
    .set('sim-signature', `t=${t},v1=${sig}`)
    .send(body);
}

// Holds the given seats and goes through checkout. Returns the provider order
// so the test can decide what the customer does next.
export async function startPayment(
  app: INestApplication,
  user: TestUser,
  showtimeId: string,
  seatIds: string[],
) {
  const hold = await request(app.getHttpServer())
    .post('/api/reservations')
    .set('Authorization', `Bearer ${user.token}`)
    .send({ showtimeId, seatIds })
    .expect(201);
  const payment = await request(app.getHttpServer())
    .post(`/api/reservations/${hold.body.id}/checkout`)
    .set('Authorization', `Bearer ${user.token}`)
    .expect(201);

  const order = [...fakeGateway(app).orders.values()].find(
    (o) => o.reference === payment.body.id,
  )!;
  return { reservationId: hold.body.id as string, paymentId: payment.body.id as string, order };
}
