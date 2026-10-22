import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import type { Env } from '../config/env';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService<Env, true>) {
    const pool = new Pool({
      connectionString: config.get('DATABASE_URL', { infer: true }),
      max: config.get('DB_POOL_SIZE', { infer: true }),
    });
    // When the database drops an idle connection (restart, failover), the
    // pool emits 'error'. With no listener Node treats that as fatal and the
    // whole process exits. The pool replaces the connection on its own, so
    // logging is enough.
    const logger = new Logger(PrismaService.name);
    pool.on('error', (err) => logger.warn(`Idle database connection lost: ${err.message}`));
    // Same for a connection that dies while checked out, e.g. between the
    // statements of a transaction. The query in flight gets the error; this
    // just stops the leftover event from crashing the process.
    pool.on('connect', (client) => {
      client.on('error', (err) => logger.warn(`Database connection lost: ${err.message}`));
    });

    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end().catch(() => undefined);
  }
}
