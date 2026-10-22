import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { WebSocket } from 'ws';
import { PrismaService } from '../src/database/prisma.service';
import { createTestApp } from './create-app';
import { createShow, createUsers, type TestUser } from './fixtures';

type Message = { type: string; showtimeId?: string; seats?: { id: string; status: string; version: number }[] };

describe('Live seat updates over WebSocket (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let wsUrl: string;
  let alice: TestUser;
  const open: WebSocket[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    wsUrl = (await app.getUrl()).replace(/^http/, 'ws').replace('[::1]', 'localhost') + '/ws';
    prisma = app.get(PrismaService);
    [alice] = (await createUsers(prisma, 1)) as [TestUser];
  });

  afterAll(async () => {
    open.forEach((s) => s.terminate());
    await app.close();
  });

  async function connect(origin?: string) {
    const socket = new WebSocket(wsUrl, origin ? { origin } : {});
    open.push(socket);
    const messages: Message[] = [];
    socket.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
    await new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve());
      socket.once('error', reject);
    });
    return { socket, messages };
  }

  async function waitFor(messages: Message[], predicate: (m: Message) => boolean) {
    for (let i = 0; i < 100; i++) {
      const found = messages.find(predicate);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`Timed out. Got: ${JSON.stringify(messages)}`);
  }

  const subscribe = (socket: WebSocket, showtimeId: string) =>
    socket.send(JSON.stringify({ event: 'subscribe', data: { showtimeId } }));

  it('pushes seat changes to subscribers of that show only', async () => {
    const show = await createShow(prisma, { seats: 10 });
    const other = await createShow(prisma, { seats: 10 });
    const watcher = await connect('http://localhost:3000');
    const bystander = await connect();
    subscribe(watcher.socket, show.showtimeId);
    subscribe(bystander.socket, other.showtimeId);
    await waitFor(watcher.messages, (m) => m.type === 'subscribed');
    await waitFor(bystander.messages, (m) => m.type === 'subscribed');

    await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ showtimeId: show.showtimeId, seatIds: [show.seatIds[3]!] })
      .expect(201);

    const update = await waitFor(watcher.messages, (m) => m.type === 'seats');
    expect(update).toEqual({
      type: 'seats',
      showtimeId: show.showtimeId,
      seats: [{ id: show.seatIds[3], status: 'HELD', version: 1 }],
    });

    await new Promise((r) => setTimeout(r, 100));
    expect(bystander.messages.filter((m) => m.type === 'seats')).toEqual([]);
  });

  it('stops sending after unsubscribe', async () => {
    const show = await createShow(prisma, { seats: 10 });
    const { socket, messages } = await connect();
    subscribe(socket, show.showtimeId);
    await waitFor(messages, (m) => m.type === 'subscribed');
    socket.send(JSON.stringify({ event: 'unsubscribe', data: { showtimeId: show.showtimeId } }));
    await new Promise((r) => setTimeout(r, 50));

    await request(app.getHttpServer())
      .post('/api/reservations')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ showtimeId: show.showtimeId, seatIds: [show.seatIds[0]!] })
      .expect(201);
    await new Promise((r) => setTimeout(r, 150));
    expect(messages.filter((m) => m.type === 'seats')).toEqual([]);
  });

  it('rejects bad subscriptions', async () => {
    const { socket, messages } = await connect();
    subscribe(socket, 'not-a-uuid');
    const error = await waitFor(messages, (m) => m.type === 'error');
    expect(error).toMatchObject({ type: 'error' });
  });

  it('refuses connections from other sites', async () => {
    const socket = new WebSocket(wsUrl, { origin: 'https://evil.example' });
    open.push(socket);
    const code = await new Promise<number>((resolve) => socket.once('close', (c) => resolve(c)));
    expect(code).toBe(1008);
  });
});
