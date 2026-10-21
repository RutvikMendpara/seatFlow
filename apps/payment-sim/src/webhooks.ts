import { createHmac } from 'node:crypto';
import { config } from './config.ts';
import { newId, type Order } from './store.ts';

export type Delivery = 'normal' | 'late' | 'duplicate' | 'drop';

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000];

// Same scheme as most providers: HMAC over "timestamp.body", so a captured
// webhook can't be replayed later with a fresh timestamp.
export function sign(body: string, timestamp: number, secret = config.webhookSecret) {
  const digest = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

export function paymentEvent(order: Order) {
  return {
    id: newId('evt'),
    type: order.status === 'paid' ? 'payment.succeeded' : 'payment.failed',
    createdAt: new Date().toISOString(),
    data: {
      orderId: order.id,
      paymentId: order.paymentId,
      amount: order.amount,
      currency: order.currency,
      reference: order.reference,
      status: order.status,
      failureReason: order.failureReason,
    },
  };
}

async function send(event: ReturnType<typeof paymentEvent>, attempt = 0): Promise<void> {
  const body = JSON.stringify(event);
  try {
    const res = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'sim-signature': sign(body, Math.floor(Date.now() / 1000)),
      },
      body,
    });
    console.log(`webhook ${event.id} ${event.type} -> ${res.status}`);
    if (res.ok) return;
  } catch (err) {
    console.log(`webhook ${event.id} failed: ${(err as Error).message}`);
  }

  const delay = RETRY_DELAYS_MS[attempt];
  if (delay === undefined) {
    console.log(`webhook ${event.id} gave up after ${attempt + 1} attempts`);
    return;
  }
  setTimeout(() => void send(event, attempt + 1), delay);
}

export function deliver(order: Order, delivery: Delivery) {
  const event = paymentEvent(order);
  switch (delivery) {
    case 'normal':
      void send(event);
      break;
    case 'late':
      setTimeout(() => void send(event), config.lateWebhookDelayMs);
      break;
    case 'duplicate':
      // The same event, several times, at the same moment.
      for (let i = 0; i < 3; i++) void send(event);
      break;
    case 'drop':
      console.log(`webhook ${event.id} dropped on purpose`);
      break;
  }
}
