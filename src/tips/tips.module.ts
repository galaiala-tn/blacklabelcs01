import { Module } from '@nestjs/common';
import { TipsController } from './tips.controller';
import { TipsService } from './tips.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [TipsController],
  providers: [TipsService],
  // Exported so PaymentsModule can route tip-related Stripe webhook
  // events (metadata.type === 'tip') to TipsService.markPaid/markFailed.
  exports: [TipsService],
})
export class TipsModule {}
