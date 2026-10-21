import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { PaymentsCoreModule } from './payments-core.module';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [PaymentsCoreModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [CheckoutService],
})
export class PaymentsModule {}
