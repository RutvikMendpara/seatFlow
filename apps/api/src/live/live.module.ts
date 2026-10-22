import { Module } from '@nestjs/common';
import { SeatChangeListener } from './seat-change-listener';
import { SeatsGateway } from './seats.gateway';

@Module({
  providers: [SeatChangeListener, SeatsGateway],
})
export class LiveModule {}
