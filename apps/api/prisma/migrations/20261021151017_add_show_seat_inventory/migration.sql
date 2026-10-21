-- CreateEnum
CREATE TYPE "ShowSeatStatus" AS ENUM ('AVAILABLE', 'HELD', 'SOLD');

-- CreateTable
CREATE TABLE "show_seats" (
    "showtime_id" UUID NOT NULL,
    "seat_id" UUID NOT NULL,
    "status" "ShowSeatStatus" NOT NULL DEFAULT 'AVAILABLE',
    "held_until" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "show_seats_pkey" PRIMARY KEY ("showtime_id","seat_id")
);

-- AddForeignKey
ALTER TABLE "show_seats" ADD CONSTRAINT "show_seats_showtime_id_fkey" FOREIGN KEY ("showtime_id") REFERENCES "showtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "show_seats" ADD CONSTRAINT "show_seats_seat_id_fkey" FOREIGN KEY ("seat_id") REFERENCES "seats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A hold always has an expiry, and nothing else does.
ALTER TABLE "show_seats"
  ADD CONSTRAINT "show_seats_held_until_only_when_held"
  CHECK (("status" = 'HELD') = ("held_until" IS NOT NULL));

-- Backfill inventory for shows that already exist.
INSERT INTO "show_seats" ("showtime_id", "seat_id")
SELECT s."id", seat."id"
FROM "showtimes" s
JOIN "seats" seat ON seat."auditorium_id" = s."auditorium_id";
