import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { PricingModule } from '../pricing/pricing.module';
import { MapsModule } from '../maps/maps.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TrackingModule } from '../tracking/tracking.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PromoModule } from '../promo/promo.module';
import { CreditsModule } from '../credits/credits.module';

@Module({
  imports: [PricingModule, MapsModule, NotificationsModule, TrackingModule, InvoicesModule, PromoModule, CreditsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
