-- CreateEnum
CREATE TYPE "Certificate" AS ENUM ('U', 'UA7', 'UA13', 'UA16', 'A');

-- CreateEnum
CREATE TYPE "SeatCategory" AS ENUM ('CLASSIC', 'PREMIUM', 'RECLINER');

-- CreateEnum
CREATE TYPE "ShowFormat" AS ENUM ('STANDARD', 'THREE_D', 'IMAX');

-- CreateEnum
CREATE TYPE "ShowtimeStatus" AS ENUM ('SCHEDULED', 'CANCELLED');

-- CreateTable
CREATE TABLE "cities" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movies" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "synopsis" TEXT NOT NULL,
    "runtime_minutes" INTEGER NOT NULL,
    "languages" TEXT[],
    "genres" TEXT[],
    "certificate" "Certificate" NOT NULL,
    "release_date" DATE NOT NULL,
    "rating" DECIMAL(3,1),
    "poster_url" TEXT,
    "trailer_url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cinemas" (
    "id" UUID NOT NULL,
    "city_id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "cinemas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoriums" (
    "id" UUID NOT NULL,
    "cinema_id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "auditoriums_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seats" (
    "id" UUID NOT NULL,
    "auditorium_id" UUID NOT NULL,
    "row_label" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "category" "SeatCategory" NOT NULL,
    "grid_row" INTEGER NOT NULL,
    "grid_column" INTEGER NOT NULL,

    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showtimes" (
    "id" UUID NOT NULL,
    "movie_id" UUID NOT NULL,
    "auditorium_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "ends_at" TIMESTAMPTZ(3) NOT NULL,
    "language" TEXT NOT NULL,
    "format" "ShowFormat" NOT NULL DEFAULT 'STANDARD',
    "status" "ShowtimeStatus" NOT NULL DEFAULT 'SCHEDULED',

    CONSTRAINT "showtimes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "showtime_prices" (
    "showtime_id" UUID NOT NULL,
    "category" "SeatCategory" NOT NULL,
    "price_paise" INTEGER NOT NULL,

    CONSTRAINT "showtime_prices_pkey" PRIMARY KEY ("showtime_id","category")
);

-- CreateIndex
CREATE UNIQUE INDEX "cities_slug_key" ON "cities"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "movies_slug_key" ON "movies"("slug");

-- CreateIndex
CREATE INDEX "movies_release_date_idx" ON "movies"("release_date");

-- CreateIndex
CREATE UNIQUE INDEX "cinemas_slug_key" ON "cinemas"("slug");

-- CreateIndex
CREATE INDEX "cinemas_city_id_idx" ON "cinemas"("city_id");

-- CreateIndex
CREATE UNIQUE INDEX "auditoriums_cinema_id_name_key" ON "auditoriums"("cinema_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "seats_auditorium_id_row_label_number_key" ON "seats"("auditorium_id", "row_label", "number");

-- CreateIndex
CREATE UNIQUE INDEX "seats_auditorium_id_grid_row_grid_column_key" ON "seats"("auditorium_id", "grid_row", "grid_column");

-- CreateIndex
CREATE INDEX "showtimes_movie_id_starts_at_idx" ON "showtimes"("movie_id", "starts_at");

-- AddForeignKey
ALTER TABLE "cinemas" ADD CONSTRAINT "cinemas_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoriums" ADD CONSTRAINT "auditoriums_cinema_id_fkey" FOREIGN KEY ("cinema_id") REFERENCES "cinemas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seats" ADD CONSTRAINT "seats_auditorium_id_fkey" FOREIGN KEY ("auditorium_id") REFERENCES "auditoriums"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showtimes" ADD CONSTRAINT "showtimes_auditorium_id_fkey" FOREIGN KEY ("auditorium_id") REFERENCES "auditoriums"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "showtime_prices" ADD CONSTRAINT "showtime_prices_showtime_id_fkey" FOREIGN KEY ("showtime_id") REFERENCES "showtimes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constraints Prisma can't express in the schema.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "showtimes"
  ADD CONSTRAINT "showtimes_ends_after_start" CHECK ("ends_at" > "starts_at");

-- Two scheduled shows can't overlap in the same auditorium.
ALTER TABLE "showtimes"
  ADD CONSTRAINT "showtimes_no_overlap" EXCLUDE USING gist (
    "auditorium_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  ) WHERE ("status" = 'SCHEDULED');

ALTER TABLE "showtime_prices"
  ADD CONSTRAINT "showtime_prices_positive" CHECK ("price_paise" > 0);

ALTER TABLE "movies"
  ADD CONSTRAINT "movies_runtime_positive" CHECK ("runtime_minutes" > 0),
  ADD CONSTRAINT "movies_rating_range" CHECK ("rating" BETWEEN 0 AND 10);
