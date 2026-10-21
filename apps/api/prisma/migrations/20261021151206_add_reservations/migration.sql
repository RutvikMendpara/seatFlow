-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('HELD', 'PAYMENT_PENDING', 'CONFIRMED', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "show_seats" ADD COLUMN     "reservation_id" UUID;

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "showtime_id" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'HELD',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "subtotal_paise" INTEGER NOT NULL,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_seats" (
    "reservation_id" UUID NOT NULL,
    "showtime_id" UUID NOT NULL,
    "seat_id" UUID NOT NULL,
    "category" "SeatCategory" NOT NULL,
    "price_paise" INTEGER NOT NULL,

    CONSTRAINT "reservation_seats_pkey" PRIMARY KEY ("reservation_id","seat_id")
);

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_user_id_idempotency_key_key" ON "reservations"("user_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "show_seats_reservation_id_idx" ON "show_seats"("reservation_id");

-- AddForeignKey
ALTER TABLE "show_seats" ADD CONSTRAINT "show_seats_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_showtime_id_fkey" FOREIGN KEY ("showtime_id") REFERENCES "showtimes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_seats" ADD CONSTRAINT "reservation_seats_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_seats" ADD CONSTRAINT "reservation_seats_showtime_id_seat_id_fkey" FOREIGN KEY ("showtime_id", "seat_id") REFERENCES "show_seats"("showtime_id", "seat_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_seats" ADD CONSTRAINT "reservation_seats_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A seat has an owner exactly when it isn't available.
ALTER TABLE "show_seats"
  ADD CONSTRAINT "show_seats_owner_matches_status"
  CHECK (("status" = 'AVAILABLE') = ("reservation_id" IS NULL));

-- At most one active hold per user per show. Picking new seats replaces the old hold.
CREATE UNIQUE INDEX "reservations_one_active_hold"
  ON "reservations" ("user_id", "showtime_id")
  WHERE "status" = 'HELD';

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_subtotal_positive" CHECK ("subtotal_paise" > 0);
