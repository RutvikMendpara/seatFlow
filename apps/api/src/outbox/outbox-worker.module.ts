import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsCoreModule } from '../payments/payments-core.module';
import { BookingConfirmedHandler } from './handlers/booking-confirmed.handler';
import { RefundRequestedHandler } from './handlers/refund-requested.handler';
import { OutboxProcessor } from './outbox.processor';

@Module({
  imports: [PaymentsCoreModule, NotificationsModule],
  providers: [OutboxProcessor, BookingConfirmedHandler, RefundRequestedHandler],
  exports: [OutboxProcessor],
})
export class OutboxWorkerModule {}
