import { Module } from '@nestjs/common';
import { BookingsModule } from '../bookings/bookings.module';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway';
import { SimGatewayClient } from './gateway/sim-gateway.client';
import { PaymentOutcomesService } from './payment-outcomes.service';

// The parts of payments without HTTP, shared by the API and the worker.
@Module({
  imports: [BookingsModule],
  providers: [PaymentOutcomesService, { provide: PAYMENT_GATEWAY, useClass: SimGatewayClient }],
  exports: [PAYMENT_GATEWAY, PaymentOutcomesService],
})
export class PaymentsCoreModule {}
