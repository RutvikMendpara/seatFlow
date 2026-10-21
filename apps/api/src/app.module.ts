import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CatalogueModule } from './catalogue/catalogue.module';
import { validateEnv } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    CatalogueModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
