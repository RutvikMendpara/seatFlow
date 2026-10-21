import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { OutboxStatus } from '../generated/prisma/client';
import { BookingConfirmedHandler } from './handlers/booking-confirmed.handler';
import { RefundRequestedHandler } from './handlers/refund-requested.handler';

const BATCH_SIZE = 20;
// How long a claimed event is reserved for one worker. If the worker dies
// mid-event, another one picks it up after this.
const LEASE_SECONDS = 60;
export const MAX_ATTEMPTS = 10;

type ClaimedEvent = { id: string; type: string; payload: unknown; attempts: number };

export interface OutboxHandler {
  handle(payload: unknown): Promise<void>;
}

// Delivers each event at least once. Handlers must be idempotent, since a
// crash after the work is done but before it's marked DONE means a repeat.
@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private readonly handlers: Record<string, OutboxHandler>;

  constructor(
    private readonly prisma: PrismaService,
    bookingConfirmed: BookingConfirmedHandler,
    refundRequested: RefundRequestedHandler,
  ) {
    this.handlers = {
      'booking.confirmed': bookingConfirmed,
      'payment.refund_requested': refundRequested,
    };
  }

  async processBatch(): Promise<number> {
    // Claiming pushes available_at forward instead of holding a row lock, so
    // no transaction stays open while a handler calls the payment provider.
    const claimed = await this.prisma.$queryRaw<ClaimedEvent[]>`
      UPDATE outbox_events
      SET available_at = now() + make_interval(secs => ${LEASE_SECONDS}),
          attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM outbox_events
        WHERE status = 'PENDING' AND available_at <= now()
        ORDER BY available_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, type, payload, attempts
    `;

    for (const event of claimed) await this.process(event);
    return claimed.length;
  }

  private async process(event: ClaimedEvent) {
    const handler = this.handlers[event.type];
    try {
      if (!handler) throw new Error(`No handler for ${event.type}`);
      await handler.handle(event.payload);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: OutboxStatus.DONE, processedAt: new Date(), lastError: null },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const giveUp = event.attempts >= MAX_ATTEMPTS;
      // 10s, 20s, 40s ... capped at 10 minutes.
      const backoffSeconds = Math.min(10 * 2 ** (event.attempts - 1), 600);

      await this.prisma.$executeRaw`
        UPDATE outbox_events
        SET status = ${giveUp ? 'FAILED' : 'PENDING'}::"OutboxStatus",
            available_at = now() + make_interval(secs => ${backoffSeconds}),
            last_error = ${message}
        WHERE id = ${event.id}::uuid
      `;
      if (giveUp) {
        this.logger.error(`Outbox ${event.type} ${event.id} failed for good: ${message}`);
      } else {
        this.logger.warn(`Outbox ${event.type} ${event.id} attempt ${event.attempts}: ${message}`);
      }
    }
  }
}
