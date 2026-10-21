import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export type OutboxMessage =
  | { type: 'booking.confirmed'; payload: { bookingId: string } }
  | { type: 'payment.refund_requested'; payload: { paymentAttemptId: string; amountPaise: number } };

@Injectable()
export class OutboxService {
  // Must be called with the same transaction as the change it belongs to.
  // That's the whole point: the event exists if and only if the change committed.
  //
  // Raw SQL on purpose: Prisma fills @default(now()) from the app server's
  // clock, but the worker compares available_at against the database clock.
  // If the app clock ran ahead, new events wouldn't be due until the
  // database caught up.
  async enqueue(tx: Prisma.TransactionClient, message: OutboxMessage) {
    await tx.$executeRaw`
      INSERT INTO outbox_events (id, type, payload)
      VALUES (uuidv7(), ${message.type}, ${JSON.stringify(message.payload)}::jsonb)
    `;
  }
}
