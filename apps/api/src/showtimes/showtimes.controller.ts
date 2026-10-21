import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { MovieShowtimesQuery } from './dto/movie-showtimes.query';
import { ShowtimesService } from './showtimes.service';

@Controller()
export class ShowtimesController {
  constructor(private readonly showtimes: ShowtimesService) {}

  @Get('movies/:slug/showtimes')
  listForMovie(
    @Param('slug') slug: string,
    @Query() query: MovieShowtimesQuery,
  ) {
    return this.showtimes.listForMovie(slug, query);
  }

  @Get('showtimes/:id/seats')
  availability(@Param('id', ParseUUIDPipe) id: string) {
    return this.showtimes.availability(id);
  }

  @Get('showtimes/:id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.showtimes.findById(id);
  }
}
