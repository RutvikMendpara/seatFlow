import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListMoviesQuery } from './dto/list-movies.query';
import { MoviesService } from './movies.service';

@Controller('movies')
export class MoviesController {
  constructor(private readonly movies: MoviesService) {}

  @Get()
  list(@Query() query: ListMoviesQuery) {
    return this.movies.list(query);
  }

  @Get(':slug')
  findOne(@Param('slug') slug: string) {
    return this.movies.findBySlug(slug);
  }
}
