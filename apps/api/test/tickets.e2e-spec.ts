import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp, fakeGateway } from './create-app';
import { createShow, createUsers, type TestUser } from './fixtures';
import { sendWebhook, startPayment, webhookEvent } from './payments';

describe('Bookings and tickets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let alice: TestUser;
  let bob: TestUser;
  let staff: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const users = await createUsers(prisma, 3);
    alice = users[0]!;
    bob = users[1]!;
    staff = users[2]!;
    await prisma.user.update({ where: { id: staff.id }, data: { role: 'ADMIN' } });
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

  async function book(startsInMinutes = 30) {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10, startsInMinutes });
    const { paymentId, order } = await startPayment(app, alice, showtimeId, [
      seatIds[1]!,
      seatIds[0]!,
    ]);
    await sendWebhook(app, webhookEvent(fakeGateway(app).pay(order.id))).expect(200);
    const booking = await prisma.booking.findUniqueOrThrow({ where: { paymentAttemptId: paymentId } });

    const res = await request(app.getHttpServer())
      .get(`/api/bookings/${booking.reference}`)
      .set(as(alice))
      .expect(200);
    return res.body as { reference: string; ticket: { token: string }; cinema: { slug: string } };
  }

  const checkIn = (token: string, user = staff, cinema?: string) =>
    request(app.getHttpServer())
      .post('/api/tickets/check-in')
      .set(as(user))
      .send({ token, ...(cinema && { cinema }) });

  it('lists bookings and shows the ticket only to its owner', async () => {
    const booking = await book();
    expect(booking).toMatchObject({ seats: ['A1', 'A2'], totalPaise: 47080 });
    expect(booking.ticket.token).toMatch(/^SF1\./);

    const list = await request(app.getHttpServer()).get('/api/bookings').set(as(alice)).expect(200);
    expect(list.body.map((b: { reference: string }) => b.reference)).toContain(booking.reference);
    expect(list.body[0].ticket).toBeUndefined();

    await request(app.getHttpServer())
      .get(`/api/bookings/${booking.reference}`)
      .set(as(bob))
      .expect(404);
  });

  it('serves the ticket as a QR code', async () => {
    const booking = await book();
    const res = await request(app.getHttpServer())
      .get(`/api/bookings/${booking.reference}/ticket.svg`)
      .set(as(alice))
      .responseType('blob')
      .expect(200);
    expect(res.headers['content-type']).toMatch(/image\/svg\+xml/);
    expect((res.body as Buffer).toString()).toMatch(/^<svg/);
  });

  it('admits a ticket once', async () => {
    const booking = await book();

    const first = await checkIn(booking.ticket.token).expect(200);
    expect(first.body).toMatchObject({ result: 'admitted', seats: ['A1', 'A2'] });

    const second = await checkIn(booking.ticket.token).expect(200);
    expect(second.body.result).toBe('already_checked_in');
    expect(second.body.checkedInAt).toBe(first.body.checkedInAt);
  });

  it('lets only one of several simultaneous scans in', async () => {
    const booking = await book();
    const scans = await Promise.all(Array.from({ length: 8 }, () => checkIn(booking.ticket.token)));
    const results = scans.map((s) => s.body.result);
    expect(results.filter((r) => r === 'admitted')).toHaveLength(1);
    expect(results.filter((r) => r === 'already_checked_in')).toHaveLength(7);
  });

  it('turns away forged tickets', async () => {
    const booking = await book();
    const [prefix, id, sig] = booking.ticket.token.split('.');
    const tampered = `${prefix}.${id!.slice(0, -1)}${id!.endsWith('a') ? 'b' : 'a'}.${sig}`;

    expect((await checkIn(tampered).expect(200)).body.result).toBe('invalid');
    expect((await checkIn('SF1.nonsense.xyz').expect(200)).body.result).toBe('invalid');
  });

  it('checks the cinema and the entry window', async () => {
    const booking = await book();
    expect((await checkIn(booking.ticket.token, staff, 'somewhere-else')).body.result).toBe(
      'wrong_cinema',
    );

    const tomorrow = await book(24 * 60);
    expect((await checkIn(tomorrow.ticket.token)).body.result).toBe('too_early');
  });

  it('only lets staff check tickets in', async () => {
    const booking = await book();
    await checkIn(booking.ticket.token, alice).expect(403);
    await request(app.getHttpServer())
      .post('/api/tickets/check-in')
      .send({ token: booking.ticket.token })
      .expect(401);
  });
});
