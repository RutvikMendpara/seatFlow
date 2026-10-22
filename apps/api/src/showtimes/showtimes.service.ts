import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { istDayRange, isValidDateString } from '../common/ist-date';
import { PrismaService } from '../database/prisma.service';
import { ShowtimeStatus } from '../generated/prisma/client';
import type { MovieShowtimesQuery } from './dto/movie-showtimes.query';

type ShowPrice = { category: string; pricePaise: number };

const byPrice = (a: ShowPrice, b: ShowPrice) => a.pricePaise - b.pricePaise;

@Injectable()
export class ShowtimesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForMovie(slug: string, query: MovieShowtimesQuery) {
    if (query.date && !isValidDateString(query.date)) {
      throw new BadRequestException('date must be a valid YYYY-MM-DD date');
    }

    const [movie, city] = await Promise.all([
      this.prisma.movie.findUnique({
        where: { slug },
        select: { id: true, slug: true, title: true },
      }),
      this.prisma.city.findUnique({
        where: { slug: query.city },
        select: { id: true, slug: true, name: true },
      }),
    ]);
    if (!movie) throw new NotFoundException('Movie not found');
    if (!city) throw new NotFoundException('City not found');

    // One pass over upcoming shows to get the date strip and language options.
    const options = await this.prisma.$queryRaw<
      { day: string; language: string }[]
    >`
      SELECT DISTINCT
        to_char(s.starts_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS day,
        s.language
      FROM showtimes s
      JOIN auditoriums a ON a.id = s.auditorium_id
      JOIN cinemas c ON c.id = a.cinema_id
      WHERE s.movie_id = ${movie.id}::uuid
        AND c.city_id = ${city.id}::uuid
        AND s.status = 'SCHEDULED'
        AND s.starts_at > now()
    `;

    const languages = [...new Set(options.map((o) => o.language))].sort();
    const dates = [
      ...new Set(
        options
          .filter((o) => !query.language || o.language === query.language)
          .map((o) => o.day),
      ),
    ].sort();

    const date = query.date ?? dates[0];
    const base = { movie, city, languages, dates, date: date ?? null };
    if (!date) return { ...base, cinemas: [] };

    const { start, end } = istDayRange(date);
    const now = new Date();
    const showtimes = await this.prisma.showtime.findMany({
      where: {
        movieId: movie.id,
        status: ShowtimeStatus.SCHEDULED,
        startsAt: { gte: start > now ? start : now, lt: end },
        auditorium: { cinema: { cityId: city.id } },
        ...(query.language && { language: query.language }),
      },
      include: { auditorium: { include: { cinema: true } }, prices: true },
      orderBy: { startsAt: 'asc' },
    });

    const cinemas = new Map<
      string,
      {
        slug: string;
        name: string;
        address: string;
        showtimes: {
          id: string;
          startsAt: Date;
          language: string;
          format: string;
          auditorium: string;
          prices: ShowPrice[];
        }[];
      }
    >();
    for (const show of showtimes) {
      const { cinema } = show.auditorium;
      let entry = cinemas.get(cinema.id);
      if (!entry) {
        entry = {
          slug: cinema.slug,
          name: cinema.name,
          address: cinema.address,
          showtimes: [],
        };
        cinemas.set(cinema.id, entry);
      }
      entry.showtimes.push({
        id: show.id,
        startsAt: show.startsAt,
        language: show.language,
        format: show.format,
        auditorium: show.auditorium.name,
        prices: show.prices
          .map((p) => ({ category: p.category, pricePaise: p.pricePaise }))
          .sort(byPrice),
      });
    }

    return {
      ...base,
      cinemas: [...cinemas.values()].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  // Seats whose hold has expired count as available even before the
  // cleanup job gets to them.
  async availability(id: string) {
    const exists = await this.prisma.showtime.count({ where: { id } });
    if (!exists) throw new NotFoundException('Showtime not found');

    // version lets clients merge this snapshot with live updates that may
    // have arrived before or after it.
    const seats = await this.prisma.$queryRaw<{ id: string; status: string; version: number }[]>`
      SELECT
        seat_id AS id,
        CASE
          WHEN status = 'HELD' AND held_until <= now() THEN 'AVAILABLE'
          ELSE status::text
        END AS status,
        version
      FROM show_seats
      WHERE showtime_id = ${id}::uuid
    `;
    return { showtimeId: id, seats };
  }

  async findById(id: string) {
    const show = await this.prisma.showtime.findUnique({
      where: { id },
      include: {
        movie: true,
        prices: true,
        auditorium: {
          include: {
            cinema: { include: { city: true } },
            seats: { orderBy: [{ gridRow: 'asc' }, { gridColumn: 'asc' }] },
          },
        },
      },
    });
    if (!show) throw new NotFoundException('Showtime not found');

    const { auditorium } = show;
    const { cinema } = auditorium;
    const seats = auditorium.seats;

    return {
      id: show.id,
      startsAt: show.startsAt,
      endsAt: show.endsAt,
      language: show.language,
      format: show.format,
      status: show.status,
      movie: {
        slug: show.movie.slug,
        title: show.movie.title,
        certificate: show.movie.certificate,
        runtimeMinutes: show.movie.runtimeMinutes,
      },
      cinema: {
        slug: cinema.slug,
        name: cinema.name,
        address: cinema.address,
        city: { slug: cinema.city.slug, name: cinema.city.name },
      },
      auditorium: auditorium.name,
      prices: show.prices
        .map((p) => ({ category: p.category, pricePaise: p.pricePaise }))
        .sort(byPrice),
      layout: {
        rows: Math.max(...seats.map((s) => s.gridRow)) + 1,
        columns: Math.max(...seats.map((s) => s.gridColumn)) + 1,
        seats: seats.map((s) => ({
          id: s.id,
          label: `${s.rowLabel}${s.number}`,
          row: s.rowLabel,
          number: s.number,
          category: s.category,
          gridRow: s.gridRow,
          gridColumn: s.gridColumn,
        })),
      },
    };
  }
}

