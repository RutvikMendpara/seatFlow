import { Module } from '@nestjs/common';
import { CitiesController } from './cities.controller';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';

@Module({
  controllers: [CitiesController, MoviesController],
  providers: [MoviesService],
})
export class CatalogueModule {}
