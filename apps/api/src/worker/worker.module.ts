import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../config/env';
import { DatabaseModule } from '../database/database.module';
import { OutboxModule } from '../outbox/outbox.module';
import { OutboxWorkerModule } from '../outbox/outbox-worker.module';
import { PaymentsCoreModule } from '../payments/payments-core.module';
import { HoldExpiryService } from '../reservations/hold-expiry.service';
import { WorkerJobs } from './jobs';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    OutboxModule,
    OutboxWorkerModule,
    PaymentsCoreModule,
  ],
  providers: [HoldExpiryService, WorkerJobs],
})
export class WorkerModule {}
