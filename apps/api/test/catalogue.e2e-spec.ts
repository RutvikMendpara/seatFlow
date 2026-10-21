import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { istToday } from '../src/common/ist-date';
import { createTestApp } from './create-app';

describe('Catalogue (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('lists cities', async () => {
    const res = await request(app.getHttpServer()).get('/api/cities').expect(200);
    expect(res.body.map((c: { slug: string }) => c.slug)).toContain('mumbai');
  });

  it('lists only released movies under now showing', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/movies?city=mumbai')
      .expect(200);

    expect(res.body.movies.length).toBeGreaterThan(0);
    for (const movie of res.body.movies) {
      expect(movie.releaseDate <= istToday()).toBe(true);
    }
  });

  it('lists coming soon movies by release date', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/movies?status=coming_soon')
      .expect(200);

    const dates = res.body.movies.map((m: { releaseDate: string }) => m.releaseDate);
    expect(dates.length).toBeGreaterThan(0);
    expect(dates.every((d: string) => d > istToday())).toBe(true);
    expect([...dates].sort()).toEqual(dates);
  });

  it('filters by genre and language without narrowing the facets', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/movies?genre=Thriller&language=Hindi')
      .expect(200);

    for (const movie of res.body.movies) {
      expect(movie.genres).toContain('Thriller');
      expect(movie.languages).toContain('Hindi');
    }
    expect(res.body.facets.genres.length).toBeGreaterThan(1);
  });

  it('searches titles case-insensitively', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/movies?q=ORBIT')
      .expect(200);
    expect(res.body.movies.map((m: { slug: string }) => m.slug)).toEqual([
      'orbit-nine',
    ]);
  });

  it('rejects unknown query params', async () => {
    await request(app.getHttpServer()).get('/api/movies?sort=asc').expect(400);
  });

  it('returns 404 for an unknown movie', async () => {
    await request(app.getHttpServer()).get('/api/movies/not-a-movie').expect(404);
  });
});
