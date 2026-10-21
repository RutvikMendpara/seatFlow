import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import { HoldExpiryService } from '../reservations/hold-expiry.service';

@Injectable()
export class HoldExpiryJob implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HoldExpiryJob.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly holds: HoldExpiryService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onApplicationBootstrap() {
    const intervalMs = this.config.get('HOLD_SWEEP_INTERVAL_MS', { infer: true });
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.logger.log(`Expiring stale holds every ${intervalMs}ms`);
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  private async run() {
    // Skip a tick rather than overlap if the previous run is slow.
    if (this.running) return;
    this.running = true;
    try {
      const expired = await this.holds.expireStaleHolds();
      if (expired > 0) this.logger.log(`Expired ${expired} holds`);
    } catch (err) {
      this.logger.error('Failed to expire holds', err instanceof Error ? err.stack : err);
    } finally {
      this.running = false;
    }
  }
}
