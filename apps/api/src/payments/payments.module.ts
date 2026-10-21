import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { CheckoutService } from './checkout.service';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway';
import { SimGatewayClient } from './gateway/sim-gateway.client';
import { PaymentOutcomesService } from './payment-outcomes.service';
import { PaymentsController } from './payments.controller';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [BookingsModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [
    CheckoutService,
    PaymentOutcomesService,
    { provide: PAYMENT_GATEWAY, useClass: SimGatewayClient },
  ],
  exports: [PAYMENT_GATEWAY, PaymentOutcomesService],
})
export class PaymentsModule {}
