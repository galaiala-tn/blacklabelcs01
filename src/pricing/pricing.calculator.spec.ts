import {
  calculateFinalPrice,
  calculateHourlyBasePrice,
  calculateOneWayBasePrice,
  calculateStopsPrice,
  lookupRatePerKm,
} from './pricing.calculator';
import {
  DEFAULT_CATEGORY_CONFIG,
  DEFAULT_DISTANCE_TIERS,
  PRICING_SETTINGS_DEFAULTS,
} from './pricing.constants';
import { VehicleCategoryCode } from './dto/pricing.types';

const business = DEFAULT_CATEGORY_CONFIG[VehicleCategoryCode.BUSINESS];
const businessVan = DEFAULT_CATEGORY_CONFIG[VehicleCategoryCode.BUSINESS_VAN];
const firstClass = DEFAULT_CATEGORY_CONFIG[VehicleCategoryCode.FIRST_CLASS];

const businessTiers = DEFAULT_DISTANCE_TIERS[VehicleCategoryCode.BUSINESS];
const firstClassTiers = DEFAULT_DISTANCE_TIERS[VehicleCategoryCode.FIRST_CLASS];

const MIN_DIST = PRICING_SETTINGS_DEFAULTS.oneWayMinDistanceKm;

describe('One Way Transfer pricing — matches the SQL functions validated in Phase 1', () => {
  it('applies the flat minimum at 15km (<=19km)', () => {
    expect(calculateOneWayBasePrice(15, business, businessTiers, MIN_DIST)).toBe(90);
  });

  it('applies the flat minimum exactly at the 19km boundary', () => {
    expect(calculateOneWayBasePrice(19, business, businessTiers, MIN_DIST)).toBe(90);
  });

  it('switches to per-km pricing just above the boundary (20km -> 89.40)', () => {
    expect(calculateOneWayBasePrice(20, business, businessTiers, MIN_DIST)).toBe(89.4);
  });

  it('mid-bracket: business @45km -> 186.75', () => {
    expect(calculateOneWayBasePrice(45, business, businessTiers, MIN_DIST)).toBe(186.75);
  });

  it('resolves the 200km boundary to the bounded 101-200 bracket (600.00), not the 200+ bracket', () => {
    expect(calculateOneWayBasePrice(200, business, businessTiers, MIN_DIST)).toBe(600);
    expect(lookupRatePerKm(200, businessTiers)).toBe(3.0);
  });

  it('uses the 200+ bracket above 200km: business @250km -> 675.00', () => {
    expect(calculateOneWayBasePrice(250, business, businessTiers, MIN_DIST)).toBe(675);
  });

  it('first class @500km -> 2000.00', () => {
    expect(calculateOneWayBasePrice(500, firstClass, firstClassTiers, MIN_DIST)).toBe(2000);
  });

  it('rejects zero or negative distance', () => {
    expect(() => calculateOneWayBasePrice(0, business, businessTiers, MIN_DIST)).toThrow();
  });
});

describe('Hourly Chauffeur Service pricing', () => {
  it('clamps below-minimum requests up to 3 hours: first class 2h requested -> 540.00', () => {
    expect(calculateHourlyBasePrice(2, firstClass)).toBe(540);
  });

  it('business van 5h -> 600.00', () => {
    expect(calculateHourlyBasePrice(5, businessVan)).toBe(600);
  });

  it('rejects zero hours', () => {
    expect(() => calculateHourlyBasePrice(0, business)).toThrow();
  });
});

describe('Intermediate stops pricing', () => {
  it('business 4km @ 7.5$/km -> 30.00 (within [6,9] range)', () => {
    expect(calculateStopsPrice(4, 7.5, business)).toBe(30);
  });

  it('rejects a rate outside the category range (20$/km for business [6,9])', () => {
    expect(() => calculateStopsPrice(4, 20, business)).toThrow();
  });

  it('rejects negative extra distance', () => {
    expect(() => calculateStopsPrice(-1, 7, business)).toThrow();
  });
});

describe('Final price = (base + stops + options) * tax multiplier', () => {
  it('186.75 base + 24 stops + 30 meet&greet, *1.199 -> 288.66', () => {
    const result = calculateFinalPrice(186.75, 24, 30, PRICING_SETTINGS_DEFAULTS.serviceTaxMultiplier);
    expect(result.subtotal).toBe(240.75);
    expect(result.totalPrice).toBe(288.66);
  });

  it('handles zero stops/options', () => {
    const result = calculateFinalPrice(90, 0, 0, PRICING_SETTINGS_DEFAULTS.serviceTaxMultiplier);
    expect(result.totalPrice).toBe(round(90 * 1.199));
  });
});

function round(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
