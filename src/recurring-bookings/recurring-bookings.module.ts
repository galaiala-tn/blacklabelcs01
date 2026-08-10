import { Module } from '@nestjs/common';
import { RecurringBookingsController } from './recurring-bookings.controller';
import { RecurringBookingsService } from './recurring-bookings.service';
import { ReservationsModule } from '../reservations/reservations.module';

@Module({
  imports: [ReservationsModule],
  controllers: [RecurringBookingsController],
  providers: [RecurringBookingsService],
})
export class RecurringBookingsModule {}
