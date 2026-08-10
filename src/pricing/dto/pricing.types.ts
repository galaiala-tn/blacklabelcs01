export enum VehicleCategoryCode {
  BUSINESS = 'business',
  BUSINESS_VAN = 'business_van',
  FIRST_CLASS = 'first_class',
}

export interface CategoryPricingConfig {
  code: VehicleCategoryCode;
  minPriceOneWay: number;
  hourlyRate: number;
  minHours: number;
  stopRateMinPerKm: number;
  stopRateMaxPerKm: number;
}

export interface DistanceTier {
  minKm: number;
  maxKm: number | null; // null = open-ended (200+ km)
  ratePerKm: number;
}

export interface PriceBreakdown {
  basePrice: number;
  stopsPrice: number;
  optionsPrice: number;
  subtotal: number;
  taxMultiplier: number;
  totalPrice: number;
}
