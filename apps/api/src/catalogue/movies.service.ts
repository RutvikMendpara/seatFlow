import { Injectable, NotFoundException } from '@nestjs/common';
import { dateColumn, istToday } from '../common/ist-date';
import { PrismaService } from '../database/prisma.service';
import { Prisma, ShowtimeStatus } from '../generated/prisma/client';
import type { ListMoviesQuery } from './dto/list-movies.query';
import { toMovieResponse } from './movie.mapper';

@Injectable()
export class MoviesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListMoviesQuery) {
    const today = dateColumn(istToday());

    const base: Prisma.MovieWhereInput =
      query.status === 'coming_soon'
        ? { releaseDate: { gt: today } }
        : {
            releaseDate: { lte: today },
            showtimes: {
              some: {
                status: ShowtimeStatus.SCHEDULED,
                startsAt: { gt: new Date() },
                ...(query.city && {
                  auditorium: { cinema: { city: { slug: query.city } } },
                }),
              },
            },
          };

    const where: Prisma.MovieWhereInput = {
      AND: [
        base,
        query.language ? { languages: { has: query.language } } : {},
        query.genre ? { genres: { has: query.genre } } : {},
        query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {},
      ],
    };

    const orderBy: Prisma.MovieOrderByWithRelationInput[] =
      query.status === 'coming_soon'
        ? [{ releaseDate: 'asc' }]
        : [{ rating: { sort: 'desc', nulls: 'last' } }, { releaseDate: 'desc' }];

    // Facets come from the base set so picking one filter doesn't hide the others.
    const [movies, facetRows] = await Promise.all([
      this.prisma.movie.findMany({ where, orderBy }),
      this.prisma.movie.findMany({
        where: base,
        select: { languages: true, genres: true },
      }),
    ]);

    return {
      movies: movies.map(toMovieResponse),
      facets: {
        languages: uniqueSorted(facetRows.flatMap((m) => m.languages)),
        genres: uniqueSorted(facetRows.flatMap((m) => m.genres)),
      },
    };
  }

  async findBySlug(slug: string) {
    const movie = await this.prisma.movie.findUnique({ where: { slug } });
    if (!movie) throw new NotFoundException('Movie not found');
    return toMovieResponse(movie);
  }
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
