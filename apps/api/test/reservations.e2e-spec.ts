import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createShow, createUsers, type TestUser } from './fixtures';
import { createTestApp } from './create-app';

describe('Reservations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    [alice, bob] = await createUsers(prisma, 2);
  });

  afterAll(async () => {
    await app.close();
  });

  const hold = (user: TestUser, showtimeId: string, seatIds: string[], key?: string) => {
    const req = request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ showtimeId, seatIds });
    return key ? req.set('Idempotency-Key', key) : req;
  };

  const getReservation = (user: TestUser, id: string) =>
    request(app.getHttpServer())
      .get(`/api/reservations/${id}`)
      .set('Authorization', `Bearer ${user!.token}`);

  const release = (user: TestUser, id: string) =>
    request(app.getHttpServer())
      .delete(`/api/reservations/${id}`)
      .set('Authorization', `Bearer ${user.token}`);

  async function seatStatuses(showtimeId: string) {
    const res = await request(app.getHttpServer())
      .get(`/api/showtimes/${showtimeId}/seats`)
      .expect(200);
    return new Map<string, string>(
      res.body.seats.map((s: { id: string; status: string }) => [s.id, s.status]),
    );
  }

  it('requires a signed in user', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    await request(app.getHttpServer())
      .post('/api/reservations')
      .send({ showtimeId, seatIds: [seatIds[0]] })
      .expect(401);
  });

  it('holds seats and prices them on the server', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const picked = seatIds.slice(0, 3);

    const res = await hold(alice, showtimeId, picked).expect(201);
    expect(res.body).toMatchObject({ status: 'HELD', showtimeId, subtotalPaise: 60000 });
    expect(res.body.seats.map((s: { label: string }) => s.label)).toEqual(['A1', 'A2', 'A3']);

    const remainingMs =
      new Date(res.body.expiresAt).getTime() - new Date(res.body.serverTime).getTime();
    expect(remainingMs).toBeGreaterThan(595_000);
    expect(remainingMs).toBeLessThanOrEqual(600_000);

    const statuses = await seatStatuses(showtimeId);
    expect(picked.map((id) => statuses.get(id))).toEqual(['HELD', 'HELD', 'HELD']);
    expect(statuses.get(seatIds[3]!)).toBe('AVAILABLE');
  });

  it('does not let a second user take held seats', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    await hold(alice, showtimeId, [seatIds[0]!]).expect(201);

    const res = await hold(bob, showtimeId, [seatIds[0]!]).expect(409);
    expect(res.body.unavailableSeatIds).toEqual([seatIds[0]]);
  });

  it('holds all requested seats or none of them', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    await hold(alice, showtimeId, [seatIds[1]!]).expect(201);

    await hold(bob, showtimeId, [seatIds[0]!, seatIds[1]!, seatIds[2]!]).expect(409);

    const statuses = await seatStatuses(showtimeId);
    expect(statuses.get(seatIds[0]!)).toBe('AVAILABLE');
    expect(statuses.get(seatIds[2]!)).toBe('AVAILABLE');
  });

  it('replaces the previous hold when the user picks again', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const first = await hold(alice, showtimeId, [seatIds[0]!, seatIds[1]!]).expect(201);
    const second = await hold(alice, showtimeId, [seatIds[1]!, seatIds[2]!]).expect(201);

    expect(second.body.id).not.toBe(first.body.id);
    const old = await getReservation(alice, first.body.id).expect(200);
    expect(old.body.status).toBe('CANCELLED');

    const statuses = await seatStatuses(showtimeId);
    expect(statuses.get(seatIds[0]!)).toBe('AVAILABLE');
    expect(statuses.get(seatIds[1]!)).toBe('HELD');
    expect(statuses.get(seatIds[2]!)).toBe('HELD');
  });

  it('releases a hold, and releasing twice is fine', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const res = await hold(alice, showtimeId, [seatIds[0]!]).expect(201);

    await release(alice, res.body.id).expect(204);
    await release(alice, res.body.id).expect(204);

    expect((await getReservation(alice, res.body.id)).body.status).toBe('CANCELLED');
    expect((await seatStatuses(showtimeId)).get(seatIds[0]!)).toBe('AVAILABLE');
    await hold(bob, showtimeId, [seatIds[0]!]).expect(201);
  });

  it("hides other users' reservations", async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const res = await hold(alice, showtimeId, [seatIds[0]!]).expect(201);

    await getReservation(bob, res.body.id).expect(404);
    await release(bob, res.body.id).expect(404);
    expect((await seatStatuses(showtimeId)).get(seatIds[0]!)).toBe('HELD');
  });

  it('lets someone else take seats once the hold expires', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const res = await hold(alice, showtimeId, [seatIds[0]!, seatIds[1]!]).expect(201);

    await prisma.$executeRaw`
      UPDATE reservations SET expires_at = now() - interval '1 second' WHERE id = ${res.body.id}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE show_seats SET held_until = now() - interval '1 second'
      WHERE reservation_id = ${res.body.id}::uuid
    `;

    expect((await seatStatuses(showtimeId)).get(seatIds[0]!)).toBe('AVAILABLE');
    expect((await getReservation(alice, res.body.id)).body.status).toBe('EXPIRED');

    await hold(bob, showtimeId, [seatIds[0]!]).expect(201);
    // Releasing the expired hold must not free the seat Bob now owns.
    await release(alice, res.body.id).expect(204);
    expect((await seatStatuses(showtimeId)).get(seatIds[0]!)).toBe('HELD');
    expect((await seatStatuses(showtimeId)).get(seatIds[1]!)).toBe('AVAILABLE');
  });

  describe('idempotency', () => {
    it('returns the same reservation for a retried request', async () => {
      const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
      const key = `retry-${Date.now()}`;

      const first = await hold(alice, showtimeId, [seatIds[0]!], key).expect(201);
      const retry = await hold(alice, showtimeId, [seatIds[0]!], key).expect(201);
      expect(retry.body.id).toBe(first.body.id);
      expect(await prisma.reservation.count({ where: { showtimeId } })).toBe(1);
    });

    it('handles two identical requests arriving together', async () => {
      const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
      const key = `race-${Date.now()}`;

      const responses = await Promise.all(
        Array.from({ length: 5 }, () => hold(alice, showtimeId, [seatIds[0]!], key)),
      );
      const ok = responses.filter((r) => r.status === 201);
      expect(ok.length).toBeGreaterThan(0);
      expect(new Set(ok.map((r) => r.body.id)).size).toBe(1);
      expect(await prisma.reservation.count({ where: { showtimeId } })).toBe(1);
    });

    it('rejects a reused key with a different body', async () => {
      const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
      const key = `reuse-${Date.now()}`;

      await hold(alice, showtimeId, [seatIds[0]!], key).expect(201);
      await hold(alice, showtimeId, [seatIds[1]!], key).expect(422);
    });
  });

  describe('validation', () => {
    it('rejects seats from another auditorium', async () => {
      const a = await createShow(prisma, { seats: 10 });
      const b = await createShow(prisma, { seats: 10 });
      await hold(alice, a.showtimeId, [b.seatIds[0]!]).expect(400);
    });

    it('rejects shows that already started', async () => {
      const { showtimeId, seatIds } = await createShow(prisma, { seats: 10, startsInMinutes: -5 });
      await hold(alice, showtimeId, [seatIds[0]!]).expect(409);
    });

    it('limits seats per booking', async () => {
      const { showtimeId, seatIds } = await createShow(prisma, { seats: 20 });
      await hold(alice, showtimeId, seatIds.slice(0, 11)).expect(400);
    });

    it('rejects a malformed idempotency key', async () => {
      const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
      await hold(alice, showtimeId, [seatIds[0]!], 'bad key!').expect(400);
    });
  });
});
