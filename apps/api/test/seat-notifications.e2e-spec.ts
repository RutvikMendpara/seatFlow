import { INestApplication } from '@nestjs/common';
import { Client, type Notification } from 'pg';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-app';
import { createShow, createUsers, type TestUser } from './fixtures';
import { TEST_DATABASE_URL } from './test-env';

type SeatChange = { showtimeId: string; seats: { id: string; status: string; version: number }[] };

describe('Seat change notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let listener: Client;
  let alice: TestUser;
  let bob: TestUser;
  const received: SeatChange[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const users = await createUsers(prisma, 2);
    alice = users[0]!;
    bob = users[1]!;

    listener = new Client({ connectionString: TEST_DATABASE_URL });
    await listener.connect();
    listener.on('notification', (n: Notification) => {
      if (n.channel === 'seat_changes' && n.payload) received.push(JSON.parse(n.payload));
    });
    await listener.query('LISTEN seat_changes');
  });

  afterAll(async () => {
    await listener.end();
    await app.close();
  });

  beforeEach(() => {
    received.length = 0;
  });

  // Notifications arrive asynchronously after the commit.
  async function changesFor(showtimeId: string, count: number) {
    for (let i = 0; i < 50; i++) {
      const matches = received.filter((r) => r.showtimeId === showtimeId);
      if (matches.length >= count) return matches;
      await new Promise((r) => setTimeout(r, 20));
    }
    return received.filter((r) => r.showtimeId === showtimeId);
  }

  const hold = (user: TestUser, showtimeId: string, seatIds: string[]) =>
    request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ showtimeId, seatIds });

  it('sends one notification per change, with increasing versions', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const res = await hold(alice, showtimeId, [seatIds[0]!, seatIds[1]!]).expect(201);
    await request(app.getHttpServer())
      .delete(`/api/reservations/${res.body.id}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .expect(204);

    const [held, released] = await changesFor(showtimeId, 2);
    expect(held?.seats.map((s) => [s.status, s.version])).toEqual([
      ['HELD', 1],
      ['HELD', 1],
    ]);
    expect(released?.seats.map((s) => [s.status, s.version])).toEqual([
      ['AVAILABLE', 2],
      ['AVAILABLE', 2],
    ]);

    const availability = await request(app.getHttpServer())
      .get(`/api/showtimes/${showtimeId}/seats`)
      .expect(200);
    const first = availability.body.seats.find((s: { id: string }) => s.id === seatIds[0]);
    expect(first).toMatchObject({ status: 'AVAILABLE', version: 2 });
  });

  it('sends nothing for a hold that rolled back', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    await hold(alice, showtimeId, [seatIds[1]!]).expect(201);
    // Bob's request locks and checks seat 0 too, then rolls back on seat 1.
    await hold(bob, showtimeId, [seatIds[0]!, seatIds[1]!]).expect(409);

    await new Promise((r) => setTimeout(r, 200));
    const changes = await changesFor(showtimeId, 1);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.seats.map((s) => s.id)).toEqual([seatIds[1]]);
  });

  it('does not bump the version when only the hold expiry moves', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    await hold(alice, showtimeId, [seatIds[0]!]).expect(201);
    await prisma.$executeRaw`
      UPDATE show_seats SET held_until = held_until + interval '5 minutes'
      WHERE showtime_id = ${showtimeId}::uuid AND seat_id = ${seatIds[0]!}::uuid
    `;
    const seat = await prisma.showSeat.findUniqueOrThrow({
      where: { showtimeId_seatId: { showtimeId, seatId: seatIds[0]! } },
    });
    expect(seat.version).toBe(1);
    await new Promise((r) => setTimeout(r, 200));
    expect(await changesFor(showtimeId, 1)).toHaveLength(1);
  });

  it('splits large changes to stay under the payload limit', async () => {
    const { showtimeId } = await createShow(prisma, { seats: 120 });
    await prisma.$executeRaw`
      UPDATE show_seats SET status = 'SOLD', reservation_id = (
        SELECT id FROM reservations LIMIT 1
      ) WHERE showtime_id = ${showtimeId}::uuid
    `;
    const changes = await changesFor(showtimeId, 3);
    // Chunks can arrive in any order. Clients merge by version, so it doesn't matter.
    expect(changes.map((c) => c.seats.length).sort((a, b) => b - a)).toEqual([50, 50, 20]);
    expect(new Set(changes.flatMap((c) => c.seats.map((s) => s.id))).size).toBe(120);
  });
});
