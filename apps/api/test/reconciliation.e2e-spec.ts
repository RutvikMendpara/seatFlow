import { INestApplication } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { PrismaService } from '../src/database/prisma.service';
import { ReconciliationService } from '../src/payments/reconciliation.service';
import { createTestApp, fakeGateway } from './create-app';
import { createTestWorker } from './create-worker';
import type { FakeGateway } from './fake-gateway';
import { createShow, createUsers, type TestUser } from './fixtures';
import { sendWebhook, startPayment, webhookEvent } from './payments';

describe('Reconciliation (e2e)', () => {
  let app: INestApplication;
  let worker: TestingModule;
  let prisma: PrismaService;
  let gateway: FakeGateway;
  let reconciliation: ReconciliationService;
  let alice: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    gateway = fakeGateway(app);
    // Same fake provider as the API, so the worker sees the same orders.
    worker = (await createTestWorker(gateway)).moduleRef;
    reconciliation = worker.get(ReconciliationService);
    [alice] = (await createUsers(prisma, 1)) as [TestUser];
  });

  afterAll(async () => {
    await worker.close();
    await app.close();
  });

  afterEach(() => {
    gateway.down = false;
  });

  async function pastDeadline(reservationId: string) {
    await prisma.$executeRaw`
      UPDATE reservations SET expires_at = now() - interval '1 minute' WHERE id = ${reservationId}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE show_seats SET held_until = now() - interval '1 minute'
      WHERE reservation_id = ${reservationId}::uuid AND status = 'HELD'
    `;
    for (const order of gateway.orders.values()) order.expiresAt = new Date(Date.now() - 60_000);
  }

  async function newPayment(seats = 1) {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    return startPayment(app, alice, showtimeId, seatIds.slice(0, seats));
  }

  const payment = (id: string) =>
    prisma.paymentAttempt.findUniqueOrThrow({ where: { id }, include: { reservation: true } });

  it('confirms a paid order whose webhook never arrived', async () => {
    const { reservationId, paymentId, order } = await newPayment();
    gateway.pay(order.id);
    await pastDeadline(reservationId);

    await reconciliation.run();

    const p = await payment(paymentId);
    expect(p.status).toBe('SUCCEEDED');
    expect(p.reservation.status).toBe('CONFIRMED');

    // The webhook finally shows up and changes nothing.
    const late = await sendWebhook(app, webhookEvent(order)).expect(200);
    expect(late.body.result).toBe('already_handled');
  });

  it('fails an abandoned payment and puts the seats back on sale', async () => {
    const { reservationId, paymentId } = await newPayment(2);
    await pastDeadline(reservationId);

    await reconciliation.run();

    const p = await payment(paymentId);
    expect(p).toMatchObject({ status: 'FAILED', failureReason: 'expired' });
    expect(p.reservation.status).toBe('EXPIRED');
    expect(
      await prisma.showSeat.count({ where: { reservationId } }),
    ).toBe(0);
  });

  it('cancels an order the provider still has open past our deadline', async () => {
    const { reservationId, paymentId, order } = await newPayment();
    await pastDeadline(reservationId);
    // Provider clock is behind, so it hasn't expired the order yet.
    gateway.orders.get(order.id)!.expiresAt = new Date(Date.now() + 60_000);

    await reconciliation.run();

    expect(gateway.orders.get(order.id)?.status).toBe('cancelled');
    expect((await payment(paymentId)).status).toBe('FAILED');
  });

  it('leaves payments alone while the provider is down', async () => {
    const { reservationId, paymentId, order } = await newPayment();
    gateway.pay(order.id);
    await pastDeadline(reservationId);

    gateway.down = true;
    await reconciliation.run();
    const p = await payment(paymentId);
    expect(p.status).toBe('PENDING');
    // Not expired yet, since the payment might still have gone through.
    expect(p.reservation.status).toBe('PAYMENT_PENDING');

    gateway.down = false;
    await reconciliation.run();
    expect((await payment(paymentId)).status).toBe('SUCCEEDED');
  });

  it('finds the order by reference when we never stored its id', async () => {
    const { reservationId, paymentId, order } = await newPayment();
    // The provider created the order, but our process died before saving the response.
    await prisma.paymentAttempt.update({
      where: { id: paymentId },
      data: { status: 'CREATED', providerOrderId: null, checkoutUrl: null },
    });
    gateway.pay(order.id);
    await pastDeadline(reservationId);

    await reconciliation.run();
    expect((await payment(paymentId)).status).toBe('SUCCEEDED');
  });

  it('fails a payment that never reached the provider', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    gateway.down = true;
    const hold = await startPayment(app, alice, showtimeId, [seatIds[0]!]).catch(() => null);
    expect(hold).toBeNull();
    gateway.down = false;

    const attempt = await prisma.paymentAttempt.findFirstOrThrow({
      where: { reservation: { showtimeId } },
    });
    expect(attempt.status).toBe('CREATED');
    await pastDeadline(attempt.reservationId);

    await reconciliation.run();
    const p = await payment(attempt.id);
    expect(p).toMatchObject({ status: 'FAILED', failureReason: 'never_reached_provider' });
    expect(p.reservation.status).toBe('EXPIRED');
  });

  it('does not touch payments still inside their window', async () => {
    const { paymentId } = await newPayment();
    await reconciliation.run();
    expect((await payment(paymentId)).status).toBe('PENDING');
  });
});
