import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { PricingModule } from './pricing/pricing.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { MapsModule } from './maps/maps.module';
import { ReservationsModule } from './reservations/reservations.module';
import { PaymentsModule } from './payments/payments.module';
import { InvoicesModule } from './invoices/invoices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TrackingModule } from './tracking/tracking.module';
import { AdminModule } from './admin/admin.module';
import { LocationsModule } from './locations/locations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { PromoModule } from './promo/promo.module';
import { RecurringBookingsModule } from './recurring-bookings/recurring-bookings.module';
import { ChatModule } from './chat/chat.module';
import { EarningsModule } from './earnings/earnings.module';
import { TipsModule } from './tips/tips.module';
import { SharingModule } from './sharing/sharing.module';
import { CreditsModule } from './credits/credits.module';
import { ChauffeurDocumentsModule } from './chauffeur-documents/chauffeur-documents.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    SupabaseModule,
    AuthModule,
    PricingModule,
    VehiclesModule,
    MapsModule,
    NotificationsModule,
    TrackingModule,
    InvoicesModule,
    PaymentsModule,
    PromoModule,
    CreditsModule,
    ReservationsModule,
    AdminModule,
    LocationsModule,
    ReviewsModule,
    RecurringBookingsModule,
    ChatModule,
    EarningsModule,
    TipsModule,
    SharingModule,
    ChauffeurDocumentsModule,
  ],
})
export class AppModule {}
