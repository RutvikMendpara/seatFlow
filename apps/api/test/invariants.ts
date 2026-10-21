import type { PrismaService } from '../src/database/prisma.service';

// Checks the booking invariants straight from the tables. Each query returns
// the rows that break a rule, so an empty result means the rule holds.
export async function findInvariantViolations(prisma: PrismaService, showtimeId: string) {
  const [doubleBooked, orphanedHolds, unownedSeats] = await Promise.all([
    // A seat belongs to at most one live reservation.
    prisma.$queryRaw<{ seat_id: string; owners: number }[]>`
      SELECT rs.seat_id, count(*)::int AS owners
      FROM reservation_seats rs
      JOIN reservations r ON r.id = rs.reservation_id
      WHERE r.showtime_id = ${showtimeId}::uuid
        AND r.status IN ('HELD', 'PAYMENT_PENDING', 'CONFIRMED')
        AND (r.status <> 'HELD' OR r.expires_at > now())
      GROUP BY rs.seat_id
      HAVING count(*) > 1
    `,
    // A held seat points at a held reservation that actually includes it.
    prisma.$queryRaw<{ seat_id: string }[]>`
      SELECT ss.seat_id
      FROM show_seats ss
      LEFT JOIN reservations r ON r.id = ss.reservation_id
      LEFT JOIN reservation_seats rs
        ON rs.reservation_id = ss.reservation_id AND rs.seat_id = ss.seat_id
      WHERE ss.showtime_id = ${showtimeId}::uuid
        AND ss.status = 'HELD'
        AND (r.status IS DISTINCT FROM 'HELD' OR rs.seat_id IS NULL)
    `,
    // Every seat of a live hold is owned by that hold in show_seats.
    prisma.$queryRaw<{ seat_id: string }[]>`
      SELECT rs.seat_id
      FROM reservation_seats rs
      JOIN reservations r ON r.id = rs.reservation_id
      JOIN show_seats ss ON ss.showtime_id = rs.showtime_id AND ss.seat_id = rs.seat_id
      WHERE r.showtime_id = ${showtimeId}::uuid
        AND r.status = 'HELD'
        AND r.expires_at > now()
        AND ss.reservation_id IS DISTINCT FROM r.id
    `,
  ]);
  return { doubleBooked, orphanedHolds, unownedSeats };
}
