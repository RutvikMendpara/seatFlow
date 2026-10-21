import { Module } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway';
import { SimGatewayClient } from './gateway/sim-gateway.client';
import { PaymentsController } from './payments.controller';

@Module({
  controllers: [PaymentsController],
  providers: [CheckoutService, { provide: PAYMENT_GATEWAY, useClass: SimGatewayClient }],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
