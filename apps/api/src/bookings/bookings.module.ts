import { Module } from '@nestjs/common';
import { BookingsCoreModule } from './bookings-core.module';
import { BookingsController } from './bookings.controller';

@Module({
  imports: [BookingsCoreModule],
  controllers: [BookingsController],
})
export class BookingsModule {}
