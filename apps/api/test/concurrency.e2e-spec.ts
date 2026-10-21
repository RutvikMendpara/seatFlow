import { INestApplication } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Agent, fetch } from 'undici';
import { PrismaService } from '../src/database/prisma.service';
import { createShow, createUsers, type TestUser } from './fixtures';
import { createTestApp } from './create-app';
import { findInvariantViolations } from './invariants';

// Defaults match the scenario in the spec. Override to try other contention
// levels, e.g. CONCURRENCY_CLIENTS=2000 CONCURRENCY_SEATS=20 DB_POOL_SIZE=20.
const CLIENTS = Number(process.env.CONCURRENCY_CLIENTS ?? 1000);
const SEATS = Number(process.env.CONCURRENCY_SEATS ?? 50);
const SEED = Number(process.env.CONCURRENCY_SEED ?? 1);
// Opening thousands of sockets at once overflows the server's accept backlog,
// which tests the OS, not the booking code. Extra requests queue client-side.
const CONNECTIONS = Number(process.env.CONCURRENCY_CONNECTIONS ?? 256);

type Outcome = { status: number; seatIds: string[]; heldSeatIds: string[]; ms: number };

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

describe('Concurrent seat holds (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;
  let users: TestUser[];
  const agent = new Agent({ connections: CONNECTIONS });

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    baseUrl = await app.getUrl();
    prisma = app.get(PrismaService);
    users = await createUsers(prisma, CLIENTS);
  }, 60_000);

  afterAll(async () => {
    await agent.close();
    await app.close();
  });

  async function attempt(user: TestUser, showtimeId: string, seatIds: string[]): Promise<Outcome> {
    const started = performance.now();
    const res = await fetch(`${baseUrl.replace('[::1]', 'localhost')}/api/reservations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${user.token}` },
      body: JSON.stringify({ showtimeId, seatIds }),
      dispatcher: agent,
    });
    const body = (await res.json()) as { seats?: { id: string }[] };
    return {
      status: res.status,
      seatIds,
      heldSeatIds: res.status === 201 ? (body.seats ?? []).map((s) => s.id) : [],
      ms: performance.now() - started,
    };
  }

  async function runScenario(name: string, pick: (seatIds: string[], i: number) => string[]) {
    const { showtimeId, seatIds } = await createShow(prisma, { seats: SEATS });

    const started = performance.now();
    const outcomes = await Promise.all(
      users.map((user, i) => attempt(user, showtimeId, pick(seatIds, i))),
    );
    const elapsedMs = performance.now() - started;

    const byStatus = outcomes.reduce<Record<number, number>>((acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    }, {});
    const latencies = outcomes.map((o) => o.ms).sort((a, b) => a - b);
    const summary = {
      scenario: name,
      clients: CLIENTS,
      seats: SEATS,
      poolSize: Number(process.env.DB_POOL_SIZE ?? 10),
      connections: CONNECTIONS,
      elapsedMs: Math.round(elapsedMs),
      requestsPerSecond: Math.round((CLIENTS / elapsedMs) * 1000),
      responses: byStatus,
      seatsHeld: outcomes.reduce((n, o) => n + o.heldSeatIds.length, 0),
      latencyMs: {
        p50: Math.round(percentile(latencies, 50)),
        p95: Math.round(percentile(latencies, 95)),
        p99: Math.round(percentile(latencies, 99)),
        max: Math.round(latencies.at(-1) ?? 0),
      },
    };
    console.log(JSON.stringify(summary, null, 2));
    mkdirSync('test-results', { recursive: true });
    writeFileSync(`test-results/concurrency-${name}.json`, JSON.stringify(summary, null, 2));

    return { showtimeId, outcomes, summary };
  }

  async function expectConsistent(showtimeId: string, outcomes: Outcome[]) {
    // Only conflicts and "busy, try again" are acceptable failures. A 500
    // would mean a deadlock or an unhandled error.
    for (const o of outcomes) expect([201, 409, 503]).toContain(o.status);

    // Each winner got exactly what it asked for, all or nothing.
    const winners = outcomes.filter((o) => o.status === 201);
    for (const w of winners) expect([...w.heldSeatIds].sort()).toEqual([...w.seatIds].sort());

    // No seat was handed to two winners.
    const allHeld = winners.flatMap((w) => w.heldSeatIds);
    expect(new Set(allHeld).size).toBe(allHeld.length);
    expect(allHeld.length).toBeLessThanOrEqual(SEATS);

    // The database agrees with what the clients were told.
    const [heldInDb, liveReservations] = await Promise.all([
      prisma.showSeat.count({ where: { showtimeId, status: 'HELD' } }),
      prisma.reservation.count({ where: { showtimeId, status: 'HELD' } }),
    ]);
    expect(heldInDb).toBe(allHeld.length);
    expect(liveReservations).toBe(winners.length);

    expect(await findInvariantViolations(prisma, showtimeId)).toEqual({
      doubleBooked: [],
      orphanedHolds: [],
      unownedSeats: [],
    });
  }

  it(`${CLIENTS} clients picking 1-4 adjacent seats from ${SEATS}`, async () => {
    const random = mulberry32(SEED);
    const { showtimeId, outcomes, summary } = await runScenario('mixed', (seatIds) => {
      const count = 1 + Math.floor(random() * 4);
      const rows = Math.ceil(seatIds.length / 10);
      const row = Math.floor(random() * rows);
      const rowSeats = seatIds.slice(row * 10, row * 10 + 10);
      const start = Math.floor(random() * Math.max(1, rowSeats.length - count + 1));
      return rowSeats.slice(start, start + count);
    });

    await expectConsistent(showtimeId, outcomes);
    expect(summary.seatsHeld).toBeGreaterThan(0);
  }, 120_000);

  it(`${CLIENTS} clients all after the same two seats`, async () => {
    const { showtimeId, outcomes } = await runScenario('hot-seat', (seatIds) =>
      seatIds.slice(0, 2),
    );

    await expectConsistent(showtimeId, outcomes);
    expect(outcomes.filter((o) => o.status === 201)).toHaveLength(1);
  }, 120_000);
});
