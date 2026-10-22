import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import { Subject } from 'rxjs';
import type { Env } from '../config/env';

export type SeatChange = {
  showtimeId: string;
  seats: { id: string; status: 'AVAILABLE' | 'HELD' | 'SOLD'; version: number }[];
};

export type LiveEvent = { type: 'seats'; change: SeatChange } | { type: 'resync' };

const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000];

// Holds one dedicated connection doing LISTEN seat_changes. LISTEN needs a
// connection to itself, so it can't come from the Prisma pool.
@Injectable()
export class SeatChangeListener implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SeatChangeListener.name);
  readonly events = new Subject<LiveEvent>();
  private client?: Client;
  private attempt = 0;
  private stopped = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    this.stopped = true;
    // Otherwise a pending reconnect would open a new connection after shutdown.
    clearTimeout(this.reconnectTimer);
    await this.client?.end().catch(() => undefined);
    this.events.complete();
  }

  private async connect() {
    if (this.stopped) return;
    const client = new Client({
      connectionString: this.config.get('DATABASE_URL', { infer: true }),
    });
    client.on('notification', (msg) => {
      if (msg.channel !== 'seat_changes' || !msg.payload) return;
      try {
        this.events.next({ type: 'seats', change: JSON.parse(msg.payload) as SeatChange });
      } catch (err) {
        this.logger.warn(`Bad seat_changes payload: ${(err as Error).message}`);
      }
    });
    client.on('error', (err) => this.reconnect(client, err));
    client.on('end', () => this.reconnect(client));

    try {
      await client.connect();
      await client.query('LISTEN seat_changes');
    } catch (err) {
      this.reconnect(client, err as Error);
      return;
    }

    const wasReconnect = this.attempt > 0;
    this.client = client;
    this.attempt = 0;
    // Anything that changed while we were disconnected was missed, so
    // clients should fetch full availability again.
    if (wasReconnect) {
      this.logger.log('Listening for seat changes again');
      this.events.next({ type: 'resync' });
    }
  }

  private reconnect(client: Client, err?: Error) {
    if (this.stopped || (this.client && this.client !== client)) return;
    this.client = undefined;
    client.removeAllListeners();
    // A dying connection can emit more than one error. Keep swallowing them,
    // since an 'error' event with no listener would crash the process.
    client.on('error', () => undefined);
    client.end().catch(() => undefined);

    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempt, RECONNECT_DELAYS_MS.length - 1)]!;
    this.attempt++;
    this.logger.warn(`Seat change listener lost (${err?.message ?? 'closed'}), retrying in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => void this.connect(), delay);
  }
}
