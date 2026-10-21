import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { OutboxProcessor } from '../outbox/outbox.processor';
import { ReconciliationService } from '../payments/reconciliation.service';
import { HoldExpiryService } from '../reservations/hold-expiry.service';

@Injectable()
export class WorkerJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerJobs.name);
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(
    private readonly holds: HoldExpiryService,
    private readonly outbox: OutboxProcessor,
    private readonly reconciliation: ReconciliationService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap() {
    this.every('expire-holds', this.config.get('HOLD_SWEEP_INTERVAL_MS', { infer: true }), () =>
      this.holds.expireStaleHolds(),
    );
    this.every('outbox', this.config.get('OUTBOX_POLL_INTERVAL_MS', { infer: true }), () =>
      this.outbox.processBatch(),
    );
    this.every('reconcile', this.config.get('RECONCILE_INTERVAL_MS', { infer: true }), () =>
      this.reconciliation.run(),
    );
  }

  onApplicationShutdown() {
    this.timers.forEach(clearInterval);
  }

  // Runs fn on an interval, skipping a tick rather than overlapping if the
  // previous run is still going.
  private every(name: string, intervalMs: number, fn: () => Promise<number>) {
    let running = false;
    this.timers.push(
      setInterval(async () => {
        if (running) return;
        running = true;
        try {
          const count = await fn();
          if (count > 0) this.logger.log(`${name}: processed ${count}`);
        } catch (err) {
          this.logger.error(`${name} failed`, err instanceof Error ? err.stack : err);
        } finally {
          running = false;
        }
      }, intervalMs),
    );
    this.logger.log(`${name} every ${intervalMs}ms`);
  }
}
