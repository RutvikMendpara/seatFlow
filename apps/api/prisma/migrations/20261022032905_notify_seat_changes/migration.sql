-- AlterTable
ALTER TABLE "show_seats" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

-- Bump the version whenever a seat changes hands. Row locks serialize updates
-- to a seat, so versions for one seat always go up in commit order.
CREATE FUNCTION show_seats_bump_version() RETURNS trigger AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER show_seats_bump_version
  BEFORE UPDATE ON "show_seats"
  FOR EACH ROW
  WHEN (OLD."status" IS DISTINCT FROM NEW."status"
        OR OLD."reservation_id" IS DISTINCT FROM NEW."reservation_id")
  EXECUTE FUNCTION show_seats_bump_version();

-- Tell listeners which seats changed. NOTIFY is only delivered if the
-- transaction commits, in commit order, so nobody hears about a hold that
-- rolled back. One notification per show per 50 seats keeps each payload
-- well under Postgres's 8000 byte limit.
CREATE FUNCTION show_seats_notify() RETURNS trigger AS $$
DECLARE
  payload text;
BEGIN
  FOR payload IN
    SELECT json_build_object(
      'showtimeId', showtime_id,
      'seats', json_agg(json_build_object('id', seat_id, 'status', status, 'version', version))
    )::text
    FROM (
      SELECT n.showtime_id, n.seat_id, n.status, n.version,
             (row_number() OVER (PARTITION BY n.showtime_id ORDER BY n.seat_id) - 1) / 50 AS chunk
      FROM new_rows n
      JOIN old_rows o ON o.showtime_id = n.showtime_id AND o.seat_id = n.seat_id
      WHERE n.version <> o.version
    ) changed
    GROUP BY showtime_id, chunk
  LOOP
    PERFORM pg_notify('seat_changes', payload);
  END LOOP;
  RETURN NULL;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER show_seats_notify
  AFTER UPDATE ON "show_seats"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION show_seats_notify();
