import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const MOVIE_STATUSES = ['now_showing', 'coming_soon'] as const;
export type MovieStatus = (typeof MOVIE_STATUSES)[number];

export class ListMoviesQuery {
  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsIn(MOVIE_STATUSES)
  status: MovieStatus = 'now_showing';

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  genre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
