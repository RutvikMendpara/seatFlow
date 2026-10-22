// Checks the booking invariants for the show from the last prepare.ts run.
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from '../src/database/prisma.service';
import { PrismaClient } from '../src/generated/prisma/client';
import { findInvariantViolations } from '../test/invariants';

async function main() {
  const { showtimeId } = JSON.parse(readFileSync(join(__dirname, '.data.json'), 'utf8'));
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;

  const [violations, held, holds] = await Promise.all([
    findInvariantViolations(prisma, showtimeId),
    prisma.showSeat.count({ where: { showtimeId, status: 'HELD' } }),
    prisma.reservation.count({ where: { showtimeId, status: 'HELD' } }),
  ]);
  const ok = Object.values(violations).every((v) => v.length === 0);
  console.log(`${held} seats held by ${holds} reservations. Invariants: ${ok ? 'OK' : 'VIOLATED'}`);
  if (!ok) console.log(violations);
  await prisma.$disconnect();
  process.exitCode = ok ? 0 : 1;
}

void main();
