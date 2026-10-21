import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env';
import { DatabaseModule } from '../database/database.module';
import { HoldExpiryService } from '../reservations/hold-expiry.service';
import { HoldExpiryJob } from './hold-expiry.job';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }), DatabaseModule],
  providers: [HoldExpiryService, HoldExpiryJob],
})
export class WorkerModule {}
