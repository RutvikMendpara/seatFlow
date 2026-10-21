import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { istDayRange } from '../src/common/ist-date';
import { createTestApp } from './create-app';

describe('Showtimes (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const getShowtimes = (query: string) =>
    request(app.getHttpServer()).get(`/api/movies/orbit-nine/showtimes?${query}`);

  it('returns upcoming shows in the city, grouped by cinema', async () => {
    const res = await getShowtimes('city=mumbai').expect(200);
    const { date, dates, cinemas } = res.body;

    expect(dates.length).toBeGreaterThan(0);
    expect(date).toBe(dates[0]);
    expect(cinemas.length).toBeGreaterThan(0);

    const { start, end } = istDayRange(date);
    const now = Date.now();
    for (const cinema of cinemas) {
      for (const show of cinema.showtimes) {
        const startsAt = new Date(show.startsAt).getTime();
        expect(startsAt).toBeGreaterThanOrEqual(Math.max(start.getTime(), now));
        expect(startsAt).toBeLessThan(end.getTime());
        expect(show.prices.length).toBeGreaterThan(0);
      }
    }
  });

  it('filters by language', async () => {
    const res = await getShowtimes('city=mumbai&language=Hindi').expect(200);
    const languages = res.body.cinemas.flatMap(
      (c: { showtimes: { language: string }[] }) =>
        c.showtimes.map((s) => s.language),
    );
    expect(new Set(languages)).toEqual(new Set(['Hindi']));
  });

  it('returns an empty day for a date with no shows', async () => {
    const res = await getShowtimes('city=mumbai&date=2020-01-01').expect(200);
    expect(res.body.cinemas).toEqual([]);
  });

  it('validates the date and city', async () => {
    await getShowtimes('city=mumbai&date=2026-13-01').expect(400);
    await getShowtimes('').expect(400);
    await getShowtimes('city=atlantis').expect(404);
  });

  it('returns a showtime with its seat layout', async () => {
    const list = await getShowtimes('city=mumbai').expect(200);
    const id = list.body.cinemas[0].showtimes[0].id;

    const res = await request(app.getHttpServer())
      .get(`/api/showtimes/${id}`)
      .expect(200);

    const { layout, prices } = res.body;
    expect(layout.seats.length).toBeGreaterThan(0);
    const categories = new Set(layout.seats.map((s: { category: string }) => s.category));
    expect(new Set(prices.map((p: { category: string }) => p.category))).toEqual(categories);
    for (const seat of layout.seats) {
      expect(seat.gridRow).toBeLessThan(layout.rows);
      expect(seat.gridColumn).toBeLessThan(layout.columns);
    }
  });

  it('rejects a malformed showtime id', async () => {
    await request(app.getHttpServer()).get('/api/showtimes/123').expect(400);
  });
});
