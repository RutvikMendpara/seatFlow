import { randomBytes, randomUUID } from 'node:crypto';
import { hashToken } from '../src/auth/auth.service';
import type { PrismaService } from '../src/database/prisma.service';
import { SeatCategory } from '../src/generated/prisma/client';

export type TestUser = { id: string; token: string };

// Inserts users and sessions directly. Going through /auth/register would
// spend most of the test running scrypt.
export async function createUsers(prisma: PrismaService, count: number): Promise<TestUser[]> {
  const users = Array.from({ length: count }, () => ({
    id: randomUUID(),
    token: randomBytes(24).toString('base64url'),
  }));
  const run = randomBytes(4).toString('hex');

  await prisma.user.createMany({
    data: users.map((u, i) => ({
      id: u.id,
      email: `load-${run}-${i}@example.com`,
      name: `Test user ${i}`,
      passwordHash: 'not-used',
    })),
  });
  await prisma.session.createMany({
    data: users.map((u) => ({
      userId: u.id,
      tokenHash: hashToken(u.token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })),
  });
  return users;
}

type ShowOptions = {
  seats?: number;
  startsInMinutes?: number;
};

// A show in its own auditorium so tests don't step on each other's inventory.
// Seats are laid out 10 to a row, all classic at Rs 200.
export async function createShow(prisma: PrismaService, options: ShowOptions = {}) {
  const seatCount = options.seats ?? 50;
  const startsInMinutes = options.startsInMinutes ?? 24 * 60;
  const suffix = randomBytes(4).toString('hex');

  const [city, movie] = await Promise.all([
    prisma.city.findFirstOrThrow(),
    prisma.movie.findFirstOrThrow({ where: { releaseDate: { lte: new Date() } } }),
  ]);
  const cinema = await prisma.cinema.create({
    data: {
      cityId: city.id,
      slug: `test-cinema-${suffix}`,
      name: `Test Cinema ${suffix}`,
      address: 'Test Road',
    },
  });
  const auditorium = await prisma.auditorium.create({
    data: { cinemaId: cinema.id, name: 'Screen 1' },
  });

  const rows = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  await prisma.seat.createMany({
    data: Array.from({ length: seatCount }, (_, i) => ({
      auditoriumId: auditorium.id,
      rowLabel: rows[Math.floor(i / 10)]!,
      number: (i % 10) + 1,
      category: SeatCategory.CLASSIC,
      gridRow: Math.floor(i / 10),
      gridColumn: i % 10,
    })),
  });

  const startsAt = new Date(Date.now() + startsInMinutes * 60 * 1000);
  const showtime = await prisma.showtime.create({
    data: {
      movieId: movie.id,
      auditoriumId: auditorium.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + movie.runtimeMinutes * 60 * 1000),
      language: movie.languages[0]!,
      prices: { create: { category: SeatCategory.CLASSIC, pricePaise: 20000 } },
    },
  });
  await prisma.$executeRaw`
    INSERT INTO show_seats (showtime_id, seat_id)
    SELECT ${showtime.id}::uuid, id FROM seats WHERE auditorium_id = ${auditorium.id}::uuid
  `;

  const seats = await prisma.seat.findMany({
    where: { auditoriumId: auditorium.id },
    orderBy: [{ gridRow: 'asc' }, { gridColumn: 'asc' }],
    select: { id: true },
  });
  return { showtimeId: showtime.id, seatIds: seats.map((s) => s.id) };
}
