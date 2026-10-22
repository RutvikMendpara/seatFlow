import { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import { WebSocket } from 'ws';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-app';
import { createShow, createUsers, type TestUser } from './fixtures';
import { findInvariantViolations } from './invariants';
import { TEST_DATABASE_URL } from './test-env';

// Things breaking underneath the app. The rule in every case: requests may
// fail, but the data must stay consistent and the app must recover on its own.
describe('Fault injection (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: Client;
  let wsUrl: string;

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    wsUrl = (await app.getUrl()).replace(/^http/, 'ws').replace('[::1]', 'localhost') + '/ws';
    prisma = app.get(PrismaService);
    admin = new Client({ connectionString: TEST_DATABASE_URL });
    await admin.connect();
  });

  afterAll(async () => {
    await admin.end();
    await app.close();
  });

  // Kills this database's connections, except our own, like a failover or
  // a network blip would.
  async function killConnections(filter = 'true') {
    const { rows } = await admin.query(
      `SELECT pg_terminate_backend(pid) AS killed FROM pg_stat_activity
       WHERE datname = current_database() AND pid <> pg_backend_pid() AND ${filter}`,
    );
    return rows.length;
  }

  const hold = (user: TestUser, showtimeId: string, seatIds: string[]) =>
    request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ showtimeId, seatIds });

  it('tells clients to resync when the seat change listener loses its connection', async () => {
    const show = await createShow(prisma, { seats: 10 });
    const [user] = (await createUsers(prisma, 1)) as [TestUser];
    const socket = new WebSocket(wsUrl);
    const messages: { type: string; seats?: unknown[] }[] = [];
    socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise((resolve) => socket.once('open', resolve));
    socket.send(JSON.stringify({ event: 'subscribe', data: { showtimeId: show.showtimeId } }));

    const waitFor = async (type: string) => {
      for (let i = 0; i < 200; i++) {
        if (messages.some((m) => m.type === type)) return;
        await new Promise((r) => setTimeout(r, 25));
      }
      throw new Error(`No ${type} message. Got ${JSON.stringify(messages)}`);
    };
    await waitFor('subscribed');

    expect(await killConnections(`query = 'LISTEN seat_changes'`)).toBeGreaterThan(0);
    // Updates may have been missed while it was down, so clients refetch.
    await waitFor('resync');

    // And it's listening again.
    await hold(user, show.showtimeId, [show.seatIds[0]!]).expect(201);
    await waitFor('seats');
    socket.terminate();
  });

  it('keeps seats consistent when database connections drop mid-booking', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 30 });
    const users = await createUsers(prisma, 150);

    const requests = users.map((user, i) => {
      const start = (i * 7) % 28;
      return hold(user, showtimeId, seatIds.slice(start, start + 2)).then((res) => ({
        status: res.status,
        reservationId: res.status === 201 ? (res.body.id as string) : null,
      }));
    });
    // Keep killing connections while the requests are in flight.
    const chaos = (async () => {
      for (let i = 0; i < 6; i++) {
        await new Promise((r) => setTimeout(r, 15));
        await killConnections(`application_name <> 'psql'`);
      }
    })();
    const outcomes = await Promise.all(requests);
    await chaos;

    const failed = outcomes.filter((o) => o.status >= 500).length;
    const won = outcomes.filter((o) => o.status === 201);
    console.log(`Connection drops: ${won.length} held, ${failed} told to retry`);

    // Lost connections are reported as "try again", never as a crash.
    const statuses = new Set(outcomes.map((o) => o.status));
    expect([...statuses].every((s) => [201, 409, 503].includes(s))).toBe(true);

    // Whatever failed, nothing is half-done or double-held.
    expect(await findInvariantViolations(prisma, showtimeId)).toEqual({
      doubleBooked: [],
      orphanedHolds: [],
      unownedSeats: [],
    });
    // Everyone told they got seats really has them.
    for (const { reservationId } of won) {
      const reservation = await prisma.reservation.findUniqueOrThrow({
        where: { id: reservationId! },
        include: { seats: true },
      });
      expect(reservation.status).toBe('HELD');
      const owned = await prisma.showSeat.count({ where: { reservationId: reservation.id } });
      expect(owned).toBe(reservation.seats.length);
    }

    // The pool replaces its dead connections and the API carries on.
    const [late] = (await createUsers(prisma, 1)) as [TestUser];
    await hold(late, showtimeId, [seatIds[29]!]).expect(201);
  });
});
