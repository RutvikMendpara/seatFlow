import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class MovieShowtimesQuery {
  @IsString()
  @IsNotEmpty()
  city: string;

  // YYYY-MM-DD in IST. Defaults to the first day that has shows.
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  language?: string;
}
