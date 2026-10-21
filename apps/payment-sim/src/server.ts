import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { checkoutPage, messagePage } from './checkout-page.ts';
import { config } from './config.ts';
import {
  currentStatus,
  newId,
  orderJson,
  orders,
  refunds,
  type Order,
} from './store.ts';
import { deliver, type Delivery } from './webhooks.ts';

const OUTCOMES = ['pay', 'fail', 'cancel'] as const;
const DELIVERIES: Delivery[] = ['normal', 'late', 'duplicate', 'drop'];

// Responses saved per idempotency key, so a retried POST gets the same answer.
const idempotent = new Map<string, { status: number; body: unknown }>();
let outage = false;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function html(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
}

function requireApiKey(req: IncomingMessage) {
  if (req.headers.authorization !== `Bearer ${config.apiKey}`) {
    throw new HttpError(401, 'Invalid API key');
  }
  if (outage) throw new HttpError(503, 'Simulated outage');
}

function findOrder(id: string | undefined) {
  const order = id ? orders.get(id) : undefined;
  if (!order) throw new HttpError(404, 'Order not found');
  return order;
}

async function withIdempotency(
  req: IncomingMessage,
  res: ServerResponse,
  handler: () => { status: number; body: unknown },
) {
  const key = req.headers['idempotency-key'];
  const cacheKey = typeof key === 'string' ? `${req.method} ${req.url} ${key}` : undefined;
  const cached = cacheKey ? idempotent.get(cacheKey) : undefined;
  if (cached) return json(res, cached.status, cached.body);

  const result = handler();
  if (cacheKey) idempotent.set(cacheKey, result);
  json(res, result.status, result.body);
}

function complete(order: Order, outcome: (typeof OUTCOMES)[number], delivery: Delivery) {
  const status = currentStatus(order);
  if (status !== 'created') throw new HttpError(409, `Order is already ${status}`);

  if (outcome === 'pay') {
    order.status = 'paid';
    order.paymentId = newId('pay');
  } else {
    order.status = outcome === 'fail' ? 'failed' : 'cancelled';
    order.failureReason = outcome === 'fail' ? 'card_declined' : 'cancelled_by_customer';
  }
  deliver(order, delivery);
}

async function route(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', config.publicUrl);
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method ?? 'GET';

  if (method === 'GET' && url.pathname === '/health') return json(res, 200, { status: 'ok' });

  // Merchant API
  if (parts[0] === 'v1') {
    requireApiKey(req);

    if (method === 'POST' && url.pathname === '/v1/orders') {
      const input = JSON.parse(await readBody(req)) as Record<string, unknown>;
      return withIdempotency(req, res, () => {
        const { amount, currency, reference, expiresAt, returnUrl } = input;
        if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
          throw new HttpError(400, 'amount must be a positive integer in paise');
        }
        if (typeof reference !== 'string' || !reference) {
          throw new HttpError(400, 'reference is required');
        }
        const order: Order = {
          id: newId('order'),
          amount,
          currency: typeof currency === 'string' ? currency : 'INR',
          reference,
          status: 'created',
          paymentId: null,
          failureReason: null,
          refundedAmount: 0,
          returnUrl: typeof returnUrl === 'string' ? returnUrl : null,
          expiresAt: new Date(
            typeof expiresAt === 'string' ? expiresAt : Date.now() + 15 * 60 * 1000,
          ),
          createdAt: new Date(),
        };
        orders.set(order.id, order);
        return { status: 201, body: orderJson(order, config.publicUrl) };
      });
    }

    if (method === 'GET' && url.pathname === '/v1/orders') {
      const reference = url.searchParams.get('reference');
      const matches = [...orders.values()].filter((o) => o.reference === reference);
      return json(res, 200, { data: matches.map((o) => orderJson(o, config.publicUrl)) });
    }

    if (method === 'GET' && parts[1] === 'orders' && parts.length === 3) {
      return json(res, 200, orderJson(findOrder(parts[2]), config.publicUrl));
    }

    if (method === 'POST' && parts[1] === 'orders' && parts[3] === 'cancel') {
      const order = findOrder(parts[2]);
      const status = currentStatus(order);
      if (status === 'paid') throw new HttpError(409, 'Order is already paid');
      if (status === 'created') {
        order.status = 'cancelled';
        order.failureReason = 'cancelled_by_merchant';
      }
      return json(res, 200, orderJson(order, config.publicUrl));
    }

    if (method === 'POST' && url.pathname === '/v1/refunds') {
      const input = JSON.parse(await readBody(req)) as { paymentId?: string; amount?: number };
      return withIdempotency(req, res, () => {
        const order = [...orders.values()].find((o) => o.paymentId === input.paymentId);
        if (!order || order.status !== 'paid') throw new HttpError(404, 'Payment not found');
        const amount = input.amount ?? order.amount - order.refundedAmount;
        if (amount <= 0 || order.refundedAmount + amount > order.amount) {
          throw new HttpError(400, 'Refund is more than the remaining amount');
        }
        order.refundedAmount += amount;
        const refund = {
          id: newId('rfnd'),
          paymentId: order.paymentId!,
          amount,
          status: 'succeeded' as const,
          createdAt: new Date(),
        };
        refunds.set(refund.id, refund);
        console.log(`refund ${refund.id} for ${refund.paymentId}: ${amount}`);
        return { status: 201, body: refund };
      });
    }

    // Test controls, so scripts can drive the flow without a browser.
    if (method === 'POST' && parts[1] === 'test' && parts[2] === 'orders' && parts[4] === 'complete') {
      const order = findOrder(parts[3]);
      const input = JSON.parse(await readBody(req)) as { outcome?: string; delivery?: string };
      const outcome = OUTCOMES.find((o) => o === input.outcome) ?? 'pay';
      const delivery = DELIVERIES.find((d) => d === input.delivery) ?? 'normal';
      complete(order, outcome, delivery);
      return json(res, 200, orderJson(order, config.publicUrl));
    }
  }

  if (method === 'POST' && url.pathname === '/test/outage') {
    // Not behind the API key, since the point is to make the API fail.
    outage = url.searchParams.get('enabled') === 'true';
    return json(res, 200, { outage });
  }

  // Hosted checkout page
  if (parts[0] === 'checkout' && parts.length === 2) {
    const order = orders.get(parts[1]!);
    if (!order) return html(res, 404, messagePage('Payment not found', 'This link is invalid.'));

    if (method === 'GET') {
      const status = currentStatus(order);
      if (status !== 'created') {
        return html(res, 200, messagePage('Nothing to pay', `This payment is ${status}.`));
      }
      return html(res, 200, checkoutPage(order));
    }

    if (method === 'POST') {
      const form = new URLSearchParams(await readBody(req));
      const outcome = OUTCOMES.find((o) => o === form.get('outcome')) ?? 'cancel';
      const delivery = DELIVERIES.find((d) => d === form.get('delivery')) ?? 'normal';
      try {
        complete(order, outcome, delivery);
      } catch (err) {
        if (err instanceof HttpError) {
          return html(res, err.status, messagePage('Payment not completed', err.message));
        }
        throw err;
      }

      if (!order.returnUrl) return html(res, 200, messagePage('Done', `Payment ${order.status}.`));
      const back = new URL(order.returnUrl);
      back.searchParams.set('orderId', order.id);
      res.writeHead(303, { location: back.toString() });
      return res.end();
    }
  }

  throw new HttpError(404, 'Not found');
}

const server = createServer((req, res) => {
  route(req, res).catch((err: unknown) => {
    if (err instanceof HttpError) return json(res, err.status, { error: err.message });
    if (err instanceof SyntaxError) return json(res, 400, { error: 'Invalid JSON' });
    console.error(err);
    json(res, 500, { error: 'Internal error' });
  });
});

server.listen(config.port, () => {
  console.log(`payment simulator on :${config.port}, webhooks to ${config.webhookUrl}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
