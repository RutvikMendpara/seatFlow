import { execSync } from 'node:child_process';
import { Client } from 'pg';
import { TEST_DATABASE_URL } from './test-env';

async function ensureDatabaseExists(url: string) {
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';

  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName],
    );
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }
}

export default async function globalSetup() {
  await ensureDatabaseExists(TEST_DATABASE_URL);

  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  execSync('pnpm exec prisma migrate deploy', { env, stdio: 'ignore' });
  // The seed clears the catalogue tables before inserting, so each run starts clean.
  execSync('pnpm exec prisma db seed', { env, stdio: 'ignore' });
}
