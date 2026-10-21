import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';

export type OutboxMessage =
  | { type: 'booking.confirmed'; payload: { bookingId: string } }
  | { type: 'payment.refund_requested'; payload: { paymentAttemptId: string; amountPaise: number } };

@Injectable()
export class OutboxService {
  // Must be called with the same transaction as the change it belongs to.
  // That's the whole point: the event exists if and only if the change committed.
  async enqueue(tx: Prisma.TransactionClient, message: OutboxMessage) {
    await tx.outboxEvent.create({ data: { type: message.type, payload: message.payload } });
  }
}
