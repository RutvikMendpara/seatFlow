import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, fakeGateway } from './create-app';
import type { FakeGateway } from './fake-gateway';
import { createShow, createUsers, type TestUser } from './fixtures';
import { findInvariantViolations } from './invariants';
import { sendWebhook, startPayment, webhookEvent } from './payments';

describe('Payment webhooks (e2e)', () => {
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

  async function state(paymentId: string) {
    const payment = await prisma.paymentAttempt.findUniqueOrThrow({
      where: { id: paymentId },
      include: { reservation: true, booking: { include: { seats: true, ticket: true } } },
    });
    const seats = await prisma.showSeat.findMany({
      where: { seatId: { in: payment.booking?.seats.map((s) => s.seatId) ?? [] } },
    });
    return { payment, reservation: payment.reservation, booking: payment.booking, seats };
  }

  async function expireDeadline(reservationId: string) {
    await prisma.$executeRaw`
      UPDATE reservations SET expires_at = now() - interval '1 minute' WHERE id = ${reservationId}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE show_seats SET held_until = now() - interval '1 minute'
      WHERE reservation_id = ${reservationId}::uuid AND status = 'HELD'
    `;
  }

  it('confirms the booking, sells the seats and issues a ticket', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { paymentId, order } = await startPayment(app, alice, showtimeId, seatIds.slice(0, 2));

    const res = await sendWebhook(app, webhookEvent(gateway.pay(order.id))).expect(200);
    expect(res.body.result).toBe('confirmed');

    const { payment, reservation, booking, seats } = await state(paymentId);
    expect(payment.status).toBe('SUCCEEDED');
    expect(reservation.status).toBe('CONFIRMED');
    expect(booking?.reference).toMatch(/^SF-[2-9A-HJ-NP-Z]{8}$/);
    expect(booking?.totalPaise).toBe(payment.amountPaise);
    expect(booking?.seats).toHaveLength(2);
    expect(booking?.ticket).toBeTruthy();
    expect(seats.map((s) => s.status)).toEqual(['SOLD', 'SOLD']);
    expect(seats.every((s) => s.heldUntil === null)).toBe(true);

    const outbox = await prisma.outboxEvent.findMany({
      where: { type: 'booking.confirmed', payload: { equals: { bookingId: booking!.id } } },
    });
    expect(outbox).toHaveLength(1);

    const status = await request(app.getHttpServer())
      .get(`/api/payments/${paymentId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(200);
    expect(status.body).toMatchObject({ status: 'SUCCEEDED', bookingReference: booking!.reference });

    expect(await findInvariantViolations(prisma, showtimeId)).toEqual({
      doubleBooked: [],
      orphanedHolds: [],
      unownedSeats: [],
    });
  });

  it('handles the same event delivered many times at once', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { paymentId, order } = await startPayment(app, alice, showtimeId, [seatIds[0]!]);
    const event = webhookEvent(gateway.pay(order.id));

    const responses = await Promise.all(Array.from({ length: 6 }, () => sendWebhook(app, event)));
    for (const r of responses) expect(r.status).toBe(200);
    expect(responses.filter((r) => r.body.result === 'confirmed')).toHaveLength(1);

    expect(await prisma.booking.count({ where: { paymentAttemptId: paymentId } })).toBe(1);
    expect(await prisma.paymentEvent.count({ where: { providerEventId: event.id } })).toBe(1);
  });

  it('ignores a second event for a payment that is already confirmed', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { paymentId, order } = await startPayment(app, alice, showtimeId, [seatIds[0]!]);
    gateway.pay(order.id);

    await sendWebhook(app, webhookEvent(order)).expect(200);
    const again = await sendWebhook(app, webhookEvent(order)).expect(200);
    expect(again.body.result).toBe('already_handled');
    expect(await prisma.booking.count({ where: { paymentAttemptId: paymentId } })).toBe(1);
  });

  it('rejects bad signatures and old timestamps without changing anything', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { paymentId, order } = await startPayment(app, alice, showtimeId, [seatIds[0]!]);
    const event = webhookEvent(gateway.pay(order.id));

    await sendWebhook(app, event, { secret: 'not_the_right_secret_at_all' }).expect(400);
    await sendWebhook(app, event, { timestamp: Math.floor(Date.now() / 1000) - 3600 }).expect(400);
    await request(app.getHttpServer())
      .post('/api/payments/webhooks')
      .send(event)
      .expect(400);

    expect((await state(paymentId)).payment.status).toBe('PENDING');
  });

  it('marks a declined payment failed and lets the user try again', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { reservationId, paymentId, order } = await startPayment(app, alice, showtimeId, [
      seatIds[0]!,
    ]);

    const res = await sendWebhook(app, webhookEvent(gateway.decline(order.id))).expect(200);
    expect(res.body.result).toBe('failed');
    const { payment, reservation } = await state(paymentId);
    expect(payment).toMatchObject({ status: 'FAILED', failureReason: 'card_declined' });
    expect(reservation.status).toBe('PAYMENT_PENDING');

    const retry = await request(app.getHttpServer())
      .post(`/api/reservations/${reservationId}/checkout`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(201);
    expect(retry.body.id).not.toBe(paymentId);
    // Retrying doesn't push the deadline out again.
    const after = await prisma.reservation.findUniqueOrThrow({ where: { id: reservationId } });
    expect(after.expiresAt).toEqual(reservation.expiresAt);
  });

  it('still confirms a late payment if nobody took the seats', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { reservationId, paymentId, order } = await startPayment(app, alice, showtimeId, [
      seatIds[0]!,
    ]);
    await expireDeadline(reservationId);

    const res = await sendWebhook(app, webhookEvent(gateway.pay(order.id))).expect(200);
    expect(res.body.result).toBe('confirmed');
    expect((await state(paymentId)).reservation.status).toBe('CONFIRMED');
  });

  it('confirms a late payment even after the seats were released, if still free', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { reservationId, paymentId, order } = await startPayment(app, alice, showtimeId, [
      seatIds[0]!,
    ]);
    await prisma.reservation.update({ where: { id: reservationId }, data: { status: 'EXPIRED' } });
    await prisma.$executeRaw`
      UPDATE show_seats SET status = 'AVAILABLE', reservation_id = NULL, held_until = NULL
      WHERE reservation_id = ${reservationId}::uuid
    `;

    const res = await sendWebhook(app, webhookEvent(gateway.pay(order.id))).expect(200);
    expect(res.body.result).toBe('confirmed');
    const { seats } = await state(paymentId);
    expect(seats[0]).toMatchObject({ status: 'SOLD', reservationId });
  });

  it('asks for a refund when a late payment finds the seats taken', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { reservationId, paymentId, order } = await startPayment(app, alice, showtimeId, [
      seatIds[0]!,
      seatIds[1]!,
    ]);
    await expireDeadline(reservationId);

    // Bob takes one of the seats after Alice's deadline.
    const bobHold = await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ showtimeId, seatIds: [seatIds[1]!] })
      .expect(201);

    const res = await sendWebhook(app, webhookEvent(gateway.pay(order.id))).expect(200);
    expect(res.body.result).toBe('refund_required');

    const { payment, reservation } = await state(paymentId);
    expect(payment).toMatchObject({ status: 'REFUND_PENDING', failureReason: 'seats_unavailable' });
    expect(payment.providerPaymentId).toBeTruthy();
    expect(reservation.status).toBe('EXPIRED');
    expect(await prisma.booking.count({ where: { reservationId } })).toBe(0);

    // Bob keeps his seat, and Alice's other seat is free again.
    const seats = await prisma.showSeat.findMany({
      where: { showtimeId, seatId: { in: [seatIds[0]!, seatIds[1]!] } },
    });
    const bySeat = new Map(seats.map((s) => [s.seatId, s]));
    expect(bySeat.get(seatIds[1]!)).toMatchObject({ status: 'HELD', reservationId: bobHold.body.id });
    expect(bySeat.get(seatIds[0]!)).toMatchObject({ status: 'AVAILABLE' });

    const refunds = await prisma.outboxEvent.findMany({
      where: { type: 'payment.refund_requested' },
    });
    expect(
      refunds.some((r) => (r.payload as { paymentAttemptId: string }).paymentAttemptId === paymentId),
    ).toBe(true);
  });

  it('refunds a payment that arrives after another payment already won', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const first = await startPayment(app, alice, showtimeId, [seatIds[0]!]);
    await sendWebhook(app, webhookEvent(gateway.decline(first.order.id))).expect(200);

    const second = await request(app.getHttpServer())
      .post(`/api/reservations/${first.reservationId}/checkout`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(201);
    const secondOrder = [...gateway.orders.values()].find((o) => o.reference === second.body.id)!;
    await sendWebhook(app, webhookEvent(gateway.pay(secondOrder.id))).expect(200);

    // The provider later reports the first order as paid too, e.g. the
    // decline was reversed. The seats already went to the second payment.
    first.order.status = 'created';
    const late = await sendWebhook(app, webhookEvent(gateway.pay(first.order.id))).expect(200);
    expect(late.body.result).toBe('refund_required');

    const { payment } = await state(first.paymentId);
    expect(payment).toMatchObject({ status: 'REFUND_PENDING', failureReason: 'already_confirmed' });
    expect(await prisma.booking.count({ where: { reservationId: first.reservationId } })).toBe(1);
  });

  it('refunds instead of confirming when the amount does not match', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { paymentId, order } = await startPayment(app, alice, showtimeId, [seatIds[0]!]);
    const paid = gateway.pay(order.id);

    const res = await sendWebhook(app, webhookEvent({ ...paid, amountPaise: 100 })).expect(200);
    expect(res.body.result).toBe('refund_required');
    expect((await state(paymentId)).payment.failureReason).toBe('amount_mismatch');
  });

  it('rolls back everything if processing fails halfway, so the retry works', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const { reservationId, paymentId, order } = await startPayment(app, alice, showtimeId, [
      seatIds[0]!,
    ]);
    const event = webhookEvent(gateway.pay(order.id));

    // Simulate a crash right before the booking is written.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION fail_booking_insert() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'simulated crash'; END $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_booking_insert BEFORE INSERT ON bookings
      FOR EACH ROW EXECUTE FUNCTION fail_booking_insert()
    `);
    try {
      await sendWebhook(app, event).expect(500);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER fail_booking_insert ON bookings');
      await prisma.$executeRawUnsafe('DROP FUNCTION fail_booking_insert');
    }

    const { payment, reservation } = await state(paymentId);
    expect(payment.status).toBe('PENDING');
    expect(reservation.status).toBe('PAYMENT_PENDING');
    expect(await prisma.paymentEvent.count({ where: { providerEventId: event.id } })).toBe(0);
    const seat = await prisma.showSeat.findFirstOrThrow({ where: { reservationId } });
    expect(seat.status).toBe('HELD');

    // The provider retries the same event.
    const retry = await sendWebhook(app, event).expect(200);
    expect(retry.body.result).toBe('confirmed');
  });

  it('acknowledges events for orders it does not know', async () => {
    const res = await sendWebhook(app, {
      id: 'evt_unknown_order',
      type: 'payment.succeeded',
      data: {
        orderId: 'order_nobody',
        reference: 'not-ours',
        paymentId: 'pay_x',
        amount: 100,
        currency: 'INR',
      },
    }).expect(200);
    expect(res.body.result).toBe('unknown_order');
  });
});
