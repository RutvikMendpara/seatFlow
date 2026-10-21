import { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/database/prisma.service';
import { MAX_ATTEMPTS, OutboxProcessor } from '../src/outbox/outbox.processor';
import { createTestApp, fakeGateway } from './create-app';
import { createTestWorker, type FakeMailer } from './create-worker';
import type { FakeGateway } from './fake-gateway';
import { createShow, createUsers, type TestUser } from './fixtures';
import { sendWebhook, startPayment, webhookEvent } from './payments';

describe('Outbox (e2e)', () => {
  let app: INestApplication;
  let worker: TestingModule;
  let prisma: PrismaService;
  let outbox: OutboxProcessor;
  let workerGateway: FakeGateway;
  let mailer: FakeMailer;
  let alice: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const created = await createTestWorker();
    worker = created.moduleRef;
    workerGateway = created.gateway;
    mailer = created.mailer;
    outbox = worker.get(OutboxProcessor);
    [alice] = (await createUsers(prisma, 1)) as [TestUser];
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  beforeEach(async () => {
    workerGateway.down = false;
    // Start each test with an empty queue so batches only contain this test's events.
    await prisma.outboxEvent.updateMany({
      where: { status: 'PENDING' },
      data: { status: 'DONE' },
    });
  });

  async function drain() {
    while ((await outbox.processBatch()) > 0);
  }

  async function paymentNeedingRefund() {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { paymentId, order } = await startPayment(app, alice, showtimeId, [seatIds[0]!]);
    const paid = fakeGateway(app).pay(order.id);
    await sendWebhook(app, webhookEvent({ ...paid, amountPaise: 100 })).expect(200);
    return paymentId;
  }

  it('emails the customer once a booking is confirmed', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { order } = await startPayment(app, alice, showtimeId, [seatIds[0]!, seatIds[1]!]);
    await sendWebhook(app, webhookEvent(fakeGateway(app).pay(order.id))).expect(200);

    const before = mailer.sent.length;
    await drain();

    const email = mailer.sent.at(-1);
    expect(mailer.sent.length).toBe(before + 1);
    expect(email?.subject).toMatch(/^Booking confirmed: .+ \(SF-[A-Z0-9]{8}\)$/);
    expect(email?.text).toContain('Seats: A1, A2');
  });

  it('refunds a payment that could not be confirmed', async () => {
    const paymentId = await paymentNeedingRefund();
    await drain();

    const payment = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('REFUNDED');
    expect(payment.refundId).toBeTruthy();
    // Refunds what the provider actually charged.
    expect(workerGateway.refunds.at(-1)).toMatchObject({
      paymentId: payment.providerPaymentId,
      amountPaise: 100,
      key: `refund-${paymentId}`,
    });
  });

  it('retries with backoff while the provider is down', async () => {
    const paymentId = await paymentNeedingRefund();
    workerGateway.down = true;
    await outbox.processBatch();

    const [event] = await prisma.outboxEvent.findMany({
      where: { type: 'payment.refund_requested', status: 'PENDING' },
    });
    expect(event?.attempts).toBe(1);
    expect(event?.lastError).toContain('provider is down');
    expect(event!.availableAt.getTime()).toBeGreaterThan(Date.now());
    // Not picked up again before the backoff runs out.
    expect(await outbox.processBatch()).toBe(0);

    workerGateway.down = false;
    await prisma.outboxEvent.update({
      where: { id: event!.id },
      data: { availableAt: new Date() },
    });
    await drain();
    const payment = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('REFUNDED');
  });

  it('does not refund twice when an event is delivered again', async () => {
    const paymentId = await paymentNeedingRefund();
    await drain();
    const refundsBefore = workerGateway.refunds.length;

    // As if the worker crashed after refunding but before marking the event done.
    await prisma.outboxEvent.updateMany({
      where: { type: 'payment.refund_requested', payload: { path: ['paymentAttemptId'], equals: paymentId } },
      data: { status: 'PENDING', availableAt: new Date() },
    });
    await drain();
    expect(workerGateway.refunds.length).toBe(refundsBefore);
  });

  it('picks up an event whose worker died mid-way', async () => {
    const paymentId = await paymentNeedingRefund();
    // Claimed once, then the lease ran out without the event being finished.
    await prisma.outboxEvent.updateMany({
      where: { payload: { path: ['paymentAttemptId'], equals: paymentId } },
      data: { attempts: 1, availableAt: new Date(Date.now() - 1000) },
    });
    await drain();
    const payment = await prisma.paymentAttempt.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.status).toBe('REFUNDED');
  });

  it('gives up after too many attempts', async () => {
    await paymentNeedingRefund();
    workerGateway.down = true;
    const [event] = await prisma.outboxEvent.findMany({
      where: { type: 'payment.refund_requested', status: 'PENDING' },
    });
    await prisma.outboxEvent.update({
      where: { id: event!.id },
      data: { attempts: MAX_ATTEMPTS - 1 },
    });

    await outbox.processBatch();
    const failed = await prisma.outboxEvent.findUniqueOrThrow({ where: { id: event!.id } });
    expect(failed.status).toBe('FAILED');
  });
});
