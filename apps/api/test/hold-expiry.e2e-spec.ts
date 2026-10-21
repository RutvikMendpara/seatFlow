import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { HoldExpiryService } from '../src/reservations/hold-expiry.service';
import { createShow, createUsers, type TestUser } from './fixtures';
import { createTestApp } from './create-app';

describe('Hold expiry (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let expiry: HoldExpiryService;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    expiry = new HoldExpiryService(prisma);
    const users = await createUsers(prisma, 2);
    alice = users[0]!;
    bob = users[1]!;
  });

  afterAll(async () => {
    await app.close();
  });

  const hold = (user: TestUser, showtimeId: string, seatIds: string[]) =>
    request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ showtimeId, seatIds })
      .expect(201);

  async function backdate(reservationId: string) {
    await prisma.$executeRaw`
      UPDATE reservations SET expires_at = now() - interval '1 second'
      WHERE id = ${reservationId}::uuid
    `;
    await prisma.$executeRaw`
      UPDATE show_seats SET held_until = now() - interval '1 second'
      WHERE reservation_id = ${reservationId}::uuid
    `;
  }

  it('expires stale holds and frees their seats', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const stale = await hold(alice, showtimeId, [seatIds[0]!, seatIds[1]!]);
    const live = await hold(bob, showtimeId, [seatIds[2]!]);
    await backdate(stale.body.id);

    expect(await expiry.expireStaleHolds()).toBeGreaterThanOrEqual(1);

    const reservations = await prisma.reservation.findMany({
      where: { showtimeId },
      select: { id: true, status: true },
    });
    expect(reservations).toEqual(
      expect.arrayContaining([
        { id: stale.body.id, status: 'EXPIRED' },
        { id: live.body.id, status: 'HELD' },
      ]),
    );

    const seats = await prisma.showSeat.findMany({
      where: { showtimeId, seatId: { in: seatIds.slice(0, 3) } },
      select: { seatId: true, status: true, reservationId: true },
    });
    const bySeat = new Map(seats.map((s) => [s.seatId, s]));
    expect(bySeat.get(seatIds[0]!)).toMatchObject({ status: 'AVAILABLE', reservationId: null });
    expect(bySeat.get(seatIds[1]!)).toMatchObject({ status: 'AVAILABLE', reservationId: null });
    expect(bySeat.get(seatIds[2]!)).toMatchObject({ status: 'HELD', reservationId: live.body.id });
  });

  it('leaves seats alone that were already taken over', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    const stale = await hold(alice, showtimeId, [seatIds[0]!]);
    await backdate(stale.body.id);

    const takeover = await hold(bob, showtimeId, [seatIds[0]!]);
    await expiry.expireStaleHolds();

    const seat = await prisma.showSeat.findUniqueOrThrow({
      where: { showtimeId_seatId: { showtimeId, seatId: seatIds[0]! } },
    });
    expect(seat).toMatchObject({ status: 'HELD', reservationId: takeover.body.id });
  });
});
