import { BadRequestException } from '@nestjs/common';
import { CategoryPricingConfig, DistanceTier, PriceBreakdown } from './dto/pricing.types';

/** Round to 2 decimals the same way Postgres's `round(numeric, 2)` does. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Finds the applicable $/km rate for a given distance.
 * Prefers the bounded tier (maxKm not null) over the open-ended tier when
 * a distance matches both (e.g. exactly 200km -> the 101-200 bracket wins,
 * not the 200+ bracket) — same tie-break as lookup_rate_per_km() in SQL.
 */
export function lookupRatePerKm(distanceKm: number, tiers: DistanceTier[]): number {
  const candidates = tiers.filter(
    (t) => distanceKm >= t.minKm && (t.maxKm === null || distanceKm <= t.maxKm),
  );
  if (candidates.length === 0) {
    throw new BadRequestException(`No pricing tier found for ${distanceKm}km`);
  }
  // bounded tiers first, then the highest minKm among ties
  candidates.sort((a, b) => {
    const aOpen = a.maxKm === null ? 1 : 0;
    const bOpen = b.maxKm === null ? 1 : 0;
    if (aOpen !== bOpen) return aOpen - bOpen;
    return b.minKm - a.minKm;
  });
  return candidates[0].ratePerKm;
}

/** One Way Transfer base price (before stops/options/tax). */
export function calculateOneWayBasePrice(
  distanceKm: number,
  config: CategoryPricingConfig,
  tiers: DistanceTier[],
  minDistanceKm: number,
): number {
  if (distanceKm <= 0) {
    throw new BadRequestException('Distance must be greater than 0km');
  }
  if (distanceKm <= minDistanceKm) {
    return config.minPriceOneWay;
  }
  const rate = lookupRatePerKm(distanceKm, tiers);
  return round2(distanceKm * rate);
}

/** Hourly Chauffeur Service base price — minimum duration is enforced (clamped up). */
export function calculateHourlyBasePrice(hours: number, config: CategoryPricingConfig): number {
  if (hours <= 0) {
    throw new BadRequestException('Booked hours must be greater than 0');
  }
  const effectiveHours = Math.max(hours, config.minHours);
  return round2(config.hourlyRate * effectiveHours);
}

/**
 * Intermediate stops price. `ratePerKm` must fall within the category's
 * allowed [stopRateMinPerKm, stopRateMaxPerKm] range (matches the DB check).
 */
export function calculateStopsPrice(
  extraKm: number,
  ratePerKm: number,
  config: CategoryPricingConfig,
): number {
  if (extraKm < 0) {
    throw new BadRequestException('Extra distance for stops cannot be negative');
  }
  if (ratePerKm < config.stopRateMinPerKm || ratePerKm > config.stopRateMaxPerKm) {
    throw new BadRequestException(
      `Stop rate ${ratePerKm} is out of the allowed range [${config.stopRateMinPerKm}, ${config.stopRateMaxPerKm}] for ${config.code}`,
    );
  }
  return round2(extraKm * ratePerKm);
}

/** Final total: (base + stops + options) * tax multiplier. */
export function calculateFinalPrice(
  basePrice: number,
  stopsPrice: number,
  optionsPrice: number,
  taxMultiplier: number,
): PriceBreakdown {
  const subtotal = round2(basePrice + stopsPrice + optionsPrice);
  const totalPrice = round2(subtotal * taxMultiplier);
  return {
    basePrice,
    stopsPrice,
    optionsPrice,
    subtotal,
    taxMultiplier,
    totalPrice,
  };
}
