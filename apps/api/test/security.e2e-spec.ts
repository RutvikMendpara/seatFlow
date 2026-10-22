import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-app';
import { createShow, createUsers, type TestUser } from './fixtures';

describe('Security (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let users: TestUser[];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    users = await createUsers(prisma, 3);
  });

  afterAll(async () => {
    await app.close();
  });

  const as = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });

  it('ignores nothing the client says about price: extra fields are rejected', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 10 });
    await request(app.getHttpServer())
      .post('/api/reservations')
      .set(as(users[0]!))
      .send({ showtimeId, seatIds: [seatIds[0]], pricePaise: 1, subtotalPaise: 1 })
      .expect(400);

    const ok = await request(app.getHttpServer())
      .post('/api/reservations')
      .set(as(users[0]!))
      .send({ showtimeId, seatIds: [seatIds[0]] })
      .expect(201);
    expect(ok.body.subtotalPaise).toBe(20000);
  });

  it('treats SQL in search as plain text', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/movies')
      .query({ q: "'; DROP TABLE movies; --" })
      .expect(200);
    expect(res.body.movies).toEqual([]);
    expect(await prisma.movie.count()).toBeGreaterThan(0);
  });

  it('slows down password guessing on one account', async () => {
    const email = `guess-${Date.now()}@example.com`;
    const attempt = () =>
      request(app.getHttpServer()).post('/api/auth/login').send({ email, password: 'wrong-password' });

    for (let i = 0; i < 10; i++) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // Counted per account: another account from the same IP is unaffected,
    // and changing IP doesn't reset the count for this one.
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: `other-${Date.now()}@example.com`, password: 'wrong-password' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.9')
      .send({ email, password: 'wrong-password' })
      .expect(429);
  });

  it('limits hold requests per user, not globally', async () => {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: 40 });
    const spammer = users[1]!;
    for (let i = 0; i < 30; i++) {
      await request(app.getHttpServer())
        .post('/api/reservations')
        .set(as(spammer))
        .send({ showtimeId, seatIds: [seatIds[i % 10]!] });
    }
    await request(app.getHttpServer())
      .post('/api/reservations')
      .set(as(spammer))
      .send({ showtimeId, seatIds: [seatIds[20]!] })
      .expect(429);

    await request(app.getHttpServer())
      .post('/api/reservations')
      .set(as(users[2]!))
      .send({ showtimeId, seatIds: [seatIds[21]!] })
      .expect(201);
  });

  it('sends security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
