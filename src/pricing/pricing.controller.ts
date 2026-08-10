import { BadRequestException, Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PricingService } from './pricing.service';
import { QuotePriceDto } from './dto/quote-price.dto';

@UseGuards(JwtAuthGuard)
@Controller('pricing')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  /** Live price preview shown while the customer is building a reservation. */
  @Post('quote')
  async quote(@Body() dto: QuotePriceDto) {
    if (dto.type === 'one_way_transfer') {
      if (dto.distanceKm === undefined) {
        throw new BadRequestException('distanceKm is required for one_way_transfer');
      }
      return this.pricingService.quoteOneWayTransfer({
        categoryId: dto.categoryId,
        distanceKm: dto.distanceKm,
        extraStopsKm: dto.extraStopsKm,
        stopRatePerKm: dto.stopRatePerKm,
        meetAndGreet: dto.meetAndGreet,
      });
    }

    if (dto.hours === undefined) {
      throw new BadRequestException('hours is required for hourly_chauffeur');
    }
    return this.pricingService.quoteHourlyChauffeur({
      categoryId: dto.categoryId,
      hours: dto.hours,
      extraStopsKm: dto.extraStopsKm,
      stopRatePerKm: dto.stopRatePerKm,
      meetAndGreet: dto.meetAndGreet,
    });
  }
}
