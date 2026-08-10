-- =========================================================
-- 00010: Pricing Calculation Functions
-- =========================================================
-- These mirror the NestJS PricingService 1:1 so the same rules
-- can be double-checked/verified server-side via RPC if needed,
-- e.g. supabase.rpc('calculate_one_way_price', {...}).
-- ---------------------------------------------------------

-- Per-km rate lookup: prefers the bounded tier (max_km not null)
-- over the open-ended tier when a distance matches both bounds
-- (e.g. exactly 200km -> the 101-200 bracket wins, not 200+).
create or replace function public.lookup_rate_per_km(p_category_id uuid, p_distance_km numeric)
returns numeric
language sql stable
as $$
  select rate_per_km
  from public.pricing_tiers
  where category_id = p_category_id
    and p_distance_km >= min_km
    and (max_km is null or p_distance_km <= max_km)
  order by (max_km is null) asc, min_km desc
  limit 1;
$$;

-- One Way Transfer base price (before stops/options/tax)
create or replace function public.calculate_one_way_base_price(p_category_id uuid, p_distance_km numeric)
returns numeric
language plpgsql stable
as $$
declare
  min_price numeric;
  min_dist  numeric;
  rate      numeric;
begin
  select min_price_one_way into min_price from public.vehicle_categories where id = p_category_id;
  select value into min_dist from public.pricing_settings where key = 'one_way_min_distance_km';

  if p_distance_km <= min_dist then
    return min_price;
  end if;

  rate := public.lookup_rate_per_km(p_category_id, p_distance_km);
  if rate is null then
    raise exception 'No pricing tier found for category % at % km', p_category_id, p_distance_km;
  end if;

  return round(p_distance_km * rate, 2);
end;
$$;

-- Hourly Chauffeur Service base price (minimum 3 hours enforced)
create or replace function public.calculate_hourly_base_price(p_category_id uuid, p_hours integer)
returns numeric
language plpgsql stable
as $$
declare
  rate    numeric;
  min_hrs integer;
  hours   integer;
begin
  select hourly_rate, min_hours into rate, min_hrs from public.vehicle_categories where id = p_category_id;
  hours := greatest(p_hours, min_hrs);
  return round(rate * hours, 2);
end;
$$;

-- Stops price: caller supplies chosen $/km rate (validated in app layer
-- to fall within [stop_rate_min_per_km, stop_rate_max_per_km]) and total extra km.
create or replace function public.calculate_stops_price(p_category_id uuid, p_extra_km numeric, p_rate_per_km numeric)
returns numeric
language plpgsql stable
as $$
declare
  min_rate numeric;
  max_rate numeric;
begin
  select stop_rate_min_per_km, stop_rate_max_per_km into min_rate, max_rate
  from public.vehicle_categories where id = p_category_id;

  if p_rate_per_km < min_rate or p_rate_per_km > max_rate then
    raise exception 'Stop rate % out of allowed range [%, %] for category %', p_rate_per_km, min_rate, max_rate, p_category_id;
  end if;

  return round(p_extra_km * p_rate_per_km, 2);
end;
$$;

-- Final total: (service + stops + options) * tax multiplier
create or replace function public.calculate_final_price(p_base numeric, p_stops numeric, p_options numeric)
returns numeric
language plpgsql stable
as $$
declare
  multiplier numeric;
  subtotal   numeric;
begin
  select value into multiplier from public.pricing_settings where key = 'service_tax_multiplier';
  subtotal := coalesce(p_base,0) + coalesce(p_stops,0) + coalesce(p_options,0);
  return round(subtotal * multiplier, 2);
end;
$$;
