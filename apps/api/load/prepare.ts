// Creates a fresh show and a batch of signed-in users for a load test, and
// writes them to load/.data.json for k6. Run against a seeded database:
//
//   pnpm exec tsx load/prepare.ts [users=1000] [seats=50]
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaService } from '../src/database/prisma.service';
import { PrismaClient } from '../src/generated/prisma/client';
import { createShow, createUsers } from '../test/fixtures';

const users = Number(process.argv[2] ?? 1000);
const seats = Number(process.argv[3] ?? 50);

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  }) as unknown as PrismaService;

  const show = await createShow(prisma, { seats });
  const created = await createUsers(prisma, users);
  writeFileSync(
    join(__dirname, '.data.json'),
    JSON.stringify({ ...show, tokens: created.map((u) => u.token) }),
  );
  console.log(`Show ${show.showtimeId} with ${seats} seats, ${users} users`);
  await prisma.$disconnect();
}

void main();
