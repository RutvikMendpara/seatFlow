import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, fakeGateway } from './create-app';
import type { FakeGateway } from './fake-gateway';
import { createShow, createUsers, type TestUser } from './fixtures';

describe('Checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gateway: FakeGateway;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    gateway = fakeGateway(app);
    const users = await createUsers(prisma, 2);
    alice = users[0]!;
    bob = users[1]!;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    gateway.down = false;
  });

  async function holdTwoSeats(user: TestUser) {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const res = await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ showtimeId, seatIds: seatIds.slice(0, 2) })
      .expect(201);
    return res.body as { id: string; expiresAt: string };
  }

  const checkout = (user: TestUser, reservationId: string) =>
    request(app.getHttpServer())
      .post(`/api/reservations/${reservationId}/checkout`)
      .set('Authorization', `Bearer ${user.token}`);

  it('creates a provider order priced on the server', async () => {
    const reservation = await holdTwoSeats(alice);

    const res = await checkout(alice, reservation.id).expect(201);
    expect(res.body).toMatchObject({
      status: 'PENDING',
      subtotalPaise: 40000,
      feePaise: 6000,
      taxPaise: 1080,
      amountPaise: 47080,
    });
    expect(res.body.checkoutUrl).toBeTruthy();

    const order = [...gateway.orders.values()].find((o) => o.reference === res.body.id);
    expect(order?.amountPaise).toBe(47080);
  });

  it('previews the price and shows the latest payment on the reservation', async () => {
    const reservation = await holdTwoSeats(alice);
    const before = await request(app.getHttpServer())
      .get(`/api/reservations/${reservation.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(before.body.price).toEqual({
      subtotalPaise: 40000,
      feePaise: 6000,
      taxPaise: 1080,
      amountPaise: 47080,
    });
    expect(before.body.latestPayment).toBeNull();

    const payment = await checkout(alice, reservation.id).expect(201);
    expect(payment.body.amountPaise).toBe(before.body.price.amountPaise);
    const after = await request(app.getHttpServer())
      .get(`/api/reservations/${reservation.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(after.body.latestPayment).toMatchObject({ id: payment.body.id, status: 'PENDING' });
  });

  it('extends the hold for the payment window, once', async () => {
    const reservation = await holdTwoSeats(alice);
    const res = await checkout(alice, reservation.id).expect(201);

    const stored = await prisma.reservation.findUniqueOrThrow({ where: { id: reservation.id } });
    expect(stored.status).toBe('PAYMENT_PENDING');
    expect(stored.expiresAt.getTime()).toBeGreaterThan(new Date(reservation.expiresAt).getTime());

    const seats = await prisma.showSeat.findMany({ where: { reservationId: reservation.id } });
    for (const seat of seats) expect(seat.heldUntil).toEqual(stored.expiresAt);

    // The provider order expires when the seats do.
    const order = [...gateway.orders.values()].find((o) => o.reference === res.body.id);
    expect(order?.expiresAt).toEqual(stored.expiresAt);
  });

  it('returns the same payment when Pay is clicked repeatedly', async () => {
    const reservation = await holdTwoSeats(alice);
    const before = gateway.orders.size;

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => checkout(alice, reservation.id)),
    );
    for (const r of responses) expect(r.status).toBe(201);
    expect(new Set(responses.map((r) => r.body.id)).size).toBe(1);
    expect(gateway.orders.size).toBe(before + 1);
    expect(await prisma.paymentAttempt.count({ where: { reservationId: reservation.id } })).toBe(1);
  });

  it('keeps the attempt when the provider is down and reuses it on retry', async () => {
    const reservation = await holdTwoSeats(alice);

    gateway.down = true;
    await checkout(alice, reservation.id).expect(502);
    const [attempt] = await prisma.paymentAttempt.findMany({
      where: { reservationId: reservation.id },
    });
    expect(attempt?.status).toBe('CREATED');

    gateway.down = false;
    const retry = await checkout(alice, reservation.id).expect(201);
    expect(retry.body.id).toBe(attempt!.id);
    expect(retry.body.status).toBe('PENDING');
  });

  it('refuses expired, released and other people’s reservations', async () => {
    const expired = await holdTwoSeats(alice);
    await prisma.$executeRaw`
      UPDATE reservations SET expires_at = now() - interval '1 second' WHERE id = ${expired.id}::uuid
    `;
    await checkout(alice, expired.id).expect(409);

    const released = await holdTwoSeats(alice);
    await request(app.getHttpServer())
      .delete(`/api/reservations/${released.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(204);
    await checkout(alice, released.id).expect(409);

    const other = await holdTwoSeats(alice);
    await checkout(bob, other.id).expect(404);
  });

  it('does not let a hold in payment be released', async () => {
    const reservation = await holdTwoSeats(alice);
    await checkout(alice, reservation.id).expect(201);

    await request(app.getHttpServer())
      .delete(`/api/reservations/${reservation.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(409);
  });

  it('shows the payment only to its owner', async () => {
    const reservation = await holdTwoSeats(alice);
    const { body } = await checkout(alice, reservation.id).expect(201);

    await request(app.getHttpServer())
      .get(`/api/payments/${body.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/payments/${body.id}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .expect(404);
  });
});
