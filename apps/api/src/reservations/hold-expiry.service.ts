import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

const BATCH_SIZE = 500;

@Injectable()
export class HoldExpiryService {
  constructor(private readonly prisma: PrismaService) {}

  // Marks expired holds and frees their seats. Booking correctness doesn't
  // depend on this running, since expired holds already count as available.
  // It just keeps show_seats and reservation statuses tidy.
  //
  // SKIP LOCKED leaves holds that a request is working on right now for the
  // next run. Seats are only reset if they still point at the expired hold,
  // because someone else may have taken them over already.
  async expireStaleHolds(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ expired: number }[]>`
      WITH stale AS (
        SELECT id FROM reservations
        WHERE status = 'HELD' AND expires_at <= now()
        ORDER BY expires_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      ),
      expired AS (
        UPDATE reservations r
        SET status = 'EXPIRED', updated_at = now()
        FROM stale
        WHERE r.id = stale.id
        RETURNING r.id
      ),
      freed AS (
        UPDATE show_seats
        SET status = 'AVAILABLE', reservation_id = NULL, held_until = NULL, updated_at = now()
        WHERE reservation_id IN (SELECT id FROM expired) AND status = 'HELD'
      )
      SELECT count(*)::int AS expired FROM expired
    `;
    return rows[0]?.expired ?? 0;
  }
}
