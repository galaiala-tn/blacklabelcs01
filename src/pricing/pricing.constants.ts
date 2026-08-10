import { CategoryPricingConfig, DistanceTier, VehicleCategoryCode } from './dto/pricing.types';

/**
 * These numbers mirror supabase/seed/seed.sql exactly. PricingService reads
 * the live values from the database (vehicle_categories / pricing_tiers /
 * pricing_settings) so admins can edit rates without a deploy — these
 * constants exist as a typed reference/fallback and as fixtures for the
 * unit tests below, so a drift between DB and code is easy to catch.
 */
export const DEFAULT_CATEGORY_CONFIG: Record<VehicleCategoryCode, CategoryPricingConfig> = {
  [VehicleCategoryCode.BUSINESS]: {
    code: VehicleCategoryCode.BUSINESS,
    minPriceOneWay: 90,
    hourlyRate: 85,
    minHours: 3,
    stopRateMinPerKm: 6,
    stopRateMaxPerKm: 9,
  },
  [VehicleCategoryCode.BUSINESS_VAN]: {
    code: VehicleCategoryCode.BUSINESS_VAN,
    minPriceOneWay: 110,
    hourlyRate: 120,
    minHours: 3,
    stopRateMinPerKm: 8,
    stopRateMaxPerKm: 11,
  },
  [VehicleCategoryCode.FIRST_CLASS]: {
    code: VehicleCategoryCode.FIRST_CLASS,
    minPriceOneWay: 160,
    hourlyRate: 180,
    minHours: 3,
    stopRateMinPerKm: 12,
    stopRateMaxPerKm: 16,
  },
};

export const DEFAULT_DISTANCE_TIERS: Record<VehicleCategoryCode, DistanceTier[]> = {
  [VehicleCategoryCode.BUSINESS]: [
    { minKm: 20, maxKm: 30, ratePerKm: 4.47 },
    { minKm: 31, maxKm: 50, ratePerKm: 4.15 },
    { minKm: 51, maxKm: 100, ratePerKm: 3.85 },
    { minKm: 101, maxKm: 200, ratePerKm: 3.0 },
    { minKm: 200, maxKm: null, ratePerKm: 2.7 },
  ],
  [VehicleCategoryCode.BUSINESS_VAN]: [
    { minKm: 20, maxKm: 30, ratePerKm: 4.95 },
    { minKm: 31, maxKm: 50, ratePerKm: 4.65 },
    { minKm: 51, maxKm: 100, ratePerKm: 4.4 },
    { minKm: 101, maxKm: 200, ratePerKm: 3.8 },
    { minKm: 200, maxKm: null, ratePerKm: 3.2 },
  ],
  [VehicleCategoryCode.FIRST_CLASS]: [
    { minKm: 20, maxKm: 30, ratePerKm: 7.8 },
    { minKm: 31, maxKm: 50, ratePerKm: 7.5 },
    { minKm: 51, maxKm: 100, ratePerKm: 7.0 },
    { minKm: 101, maxKm: 200, ratePerKm: 5.0 },
    { minKm: 200, maxKm: null, ratePerKm: 4.0 },
  ],
};

export const PRICING_SETTINGS_DEFAULTS = {
  serviceTaxMultiplier: 1.199,
  meetAndGreetFee: 30,
  oneWayMinDistanceKm: 19,
};
