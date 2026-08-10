import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import {
  calculateFinalPrice,
  calculateHourlyBasePrice,
  calculateOneWayBasePrice,
  calculateStopsPrice,
} from './pricing.calculator';
import { CategoryPricingConfig, DistanceTier, PriceBreakdown } from './dto/pricing.types';

interface OneWayQuoteInput {
  categoryId: string;
  distanceKm: number;
  extraStopsKm?: number;
  stopRatePerKm?: number;
  meetAndGreet?: boolean;
}

interface HourlyQuoteInput {
  categoryId: string;
  hours: number;
  extraStopsKm?: number;
  stopRatePerKm?: number;
  meetAndGreet?: boolean;
}

/**
 * All rates are read live from the database (vehicle_categories,
 * pricing_tiers, pricing_settings — seeded in Phase 1) so the admin
 * dashboard can edit them without a redeploy. Calculation itself is
 * delegated to the pure, unit-tested functions in pricing.calculator.ts.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly supabase: SupabaseService) {}

  private async getCategoryConfig(categoryId: string): Promise<CategoryPricingConfig> {
    const { data, error } = await this.supabase
      .getClient()
      .from('vehicle_categories')
      .select(
        'code, min_price_one_way, hourly_rate, min_hours, stop_rate_min_per_km, stop_rate_max_per_km',
      )
      .eq('id', categoryId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Vehicle category ${categoryId} not found or inactive`);
    }

    return {
      code: data.code,
      minPriceOneWay: Number(data.min_price_one_way),
      hourlyRate: Number(data.hourly_rate),
      minHours: Number(data.min_hours),
      stopRateMinPerKm: Number(data.stop_rate_min_per_km),
      stopRateMaxPerKm: Number(data.stop_rate_max_per_km),
    };
  }

  private async getDistanceTiers(categoryId: string): Promise<DistanceTier[]> {
    const { data, error } = await this.supabase
      .getClient()
      .from('pricing_tiers')
      .select('min_km, max_km, rate_per_km')
      .eq('category_id', categoryId);

    if (error) {
      throw new BadRequestException(`Could not load pricing tiers: ${error.message}`);
    }

    return (data ?? []).map((t) => ({
      minKm: Number(t.min_km),
      maxKm: t.max_km === null ? null : Number(t.max_km),
      ratePerKm: Number(t.rate_per_km),
    }));
  }

  private async getSetting(key: string): Promise<number> {
    const { data, error } = await this.supabase
      .getClient()
      .from('pricing_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) {
      throw new NotFoundException(`Pricing setting "${key}" not found`);
    }
    return Number(data.value);
  }

  async quoteOneWayTransfer(input: OneWayQuoteInput): Promise<PriceBreakdown> {
    const [config, tiers, minDistanceKm, taxMultiplier, meetAndGreetFee] = await Promise.all([
      this.getCategoryConfig(input.categoryId),
      this.getDistanceTiers(input.categoryId),
      this.getSetting('one_way_min_distance_km'),
      this.getSetting('service_tax_multiplier'),
      this.getSetting('meet_and_greet_fee'),
    ]);

    const basePrice = calculateOneWayBasePrice(input.distanceKm, config, tiers, minDistanceKm);

    const stopsPrice =
      input.extraStopsKm && input.extraStopsKm > 0
        ? calculateStopsPrice(input.extraStopsKm, this.resolveStopRate(input, config), config)
        : 0;

    const optionsPrice = input.meetAndGreet ? meetAndGreetFee : 0;

    return calculateFinalPrice(basePrice, stopsPrice, optionsPrice, taxMultiplier);
  }

  async quoteHourlyChauffeur(input: HourlyQuoteInput): Promise<PriceBreakdown> {
    const [config, taxMultiplier, meetAndGreetFee] = await Promise.all([
      this.getCategoryConfig(input.categoryId),
      this.getSetting('service_tax_multiplier'),
      this.getSetting('meet_and_greet_fee'),
    ]);

    const basePrice = calculateHourlyBasePrice(input.hours, config);

    const stopsPrice =
      input.extraStopsKm && input.extraStopsKm > 0
        ? calculateStopsPrice(input.extraStopsKm, this.resolveStopRate(input, config), config)
        : 0;

    const optionsPrice = input.meetAndGreet ? meetAndGreetFee : 0;

    return calculateFinalPrice(basePrice, stopsPrice, optionsPrice, taxMultiplier);
  }

  /** Defaults to the midpoint of the category's allowed stop-rate range if the caller didn't pick one. */
  private resolveStopRate(
    input: { stopRatePerKm?: number },
    config: CategoryPricingConfig,
  ): number {
    if (input.stopRatePerKm !== undefined) return input.stopRatePerKm;
    return (config.stopRateMinPerKm + config.stopRateMaxPerKm) / 2;
  }
}
