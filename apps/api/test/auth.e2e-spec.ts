import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './create-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const email = `auth-${Date.now()}@example.com`;
  const password = 'a-long-password';

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, reads the session and logs out', async () => {
    const agent = request.agent(app.getHttpServer());

    const res = await agent
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), name: 'Test User', password })
      .expect(201);
    expect(res.body.user).toMatchObject({ email, role: 'CUSTOMER' });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = res.headers['set-cookie']?.[0] ?? '';
    expect(cookie).toMatch(/sf_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('rejects a duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, name: 'Someone Else', password })
      .expect(409);
  });

  it('logs in with the right password only', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/auth/login').send({ email, password: 'wrong-password' }).expect(401);
    await request(server)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password })
      .expect(401);

    const res = await request(server).post('/api/auth/login').send({ email, password }).expect(200);
    expect(res.body.user.email).toBe(email);
  });

  it('accepts a bearer token', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    const token = /sf_session=([^;]+)/.exec(res.headers['set-cookie']?.[0] ?? '')?.[1];

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', 'Bearer made-up')
      .expect(401);
  });

  it('validates input', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', name: 'X', password: 'short' })
      .expect(400);
  });
});
