import type { Movie } from '../generated/prisma/client';

export function toMovieResponse(movie: Movie) {
  return {
    slug: movie.slug,
    title: movie.title,
    synopsis: movie.synopsis,
    runtimeMinutes: movie.runtimeMinutes,
    languages: movie.languages,
    genres: movie.genres,
    certificate: movie.certificate,
    // DATE column comes back as UTC midnight, so slicing the ISO string is safe.
    releaseDate: movie.releaseDate.toISOString().slice(0, 10),
    rating: movie.rating?.toNumber() ?? null,
    posterUrl: movie.posterUrl,
    trailerUrl: movie.trailerUrl,
  };
}
