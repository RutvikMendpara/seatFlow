import { Module } from '@nestjs/common';
import { BookingsCoreModule } from '../bookings/bookings-core.module';
import { PAYMENT_GATEWAY } from './gateway/payment-gateway';
import { SimGatewayClient } from './gateway/sim-gateway.client';
import { PaymentOutcomesService } from './payment-outcomes.service';
import { ReconciliationService } from './reconciliation.service';

// The parts of payments without HTTP, shared by the API and the worker.
@Module({
  imports: [BookingsCoreModule],
  providers: [
    PaymentOutcomesService,
    ReconciliationService,
    { provide: PAYMENT_GATEWAY, useClass: SimGatewayClient },
  ],
  exports: [PAYMENT_GATEWAY, PaymentOutcomesService, ReconciliationService],
})
export class PaymentsCoreModule {}
