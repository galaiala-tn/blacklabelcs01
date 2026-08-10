-- =========================================================
-- Seed: Vehicle Categories + Pricing Tiers
-- Run after all migrations, e.g.:
--   supabase db execute -f supabase/seed/seed.sql
-- =========================================================

insert into public.vehicle_categories
  (code, display_name, description, passenger_capacity, luggage_capacity,
   min_price_one_way, hourly_rate, min_hours, stop_rate_min_per_km, stop_rate_max_per_km)
values
  ('business',     'Business',     'Premium sedan for executive travel.',       3, 2, 90.00,  85.00,  3, 6.00,  9.00),
  ('business_van', 'Business Van', 'Spacious van for groups and extra luggage.', 6, 6, 110.00, 120.00, 3, 8.00,  11.00),
  ('first_class',  'First Class',  'Top-tier luxury vehicle, flagship experience.', 3, 2, 160.00, 180.00, 3, 12.00, 16.00)
on conflict (code) do update set
  display_name = excluded.display_name,
  min_price_one_way = excluded.min_price_one_way,
  hourly_rate = excluded.hourly_rate,
  stop_rate_min_per_km = excluded.stop_rate_min_per_km,
  stop_rate_max_per_km = excluded.stop_rate_max_per_km;

-- ---------------------------------------------------------
-- Distance-tiered per-km rates for One Way Transfer (distance > 19km)
-- ---------------------------------------------------------

do $$
declare
  business_id     uuid := (select id from public.vehicle_categories where code = 'business');
  van_id          uuid := (select id from public.vehicle_categories where code = 'business_van');
  first_class_id  uuid := (select id from public.vehicle_categories where code = 'first_class');
begin
  delete from public.pricing_tiers where category_id in (business_id, van_id, first_class_id);

  -- Business
  insert into public.pricing_tiers (category_id, min_km, max_km, rate_per_km) values
    (business_id, 20,  30,   4.47),
    (business_id, 31,  50,   4.15),
    (business_id, 51,  100,  3.85),
    (business_id, 101, 200,  3.00),
    (business_id, 200, null, 2.70);

  -- Business Van
  insert into public.pricing_tiers (category_id, min_km, max_km, rate_per_km) values
    (van_id, 20,  30,   4.95),
    (van_id, 31,  50,   4.65),
    (van_id, 51,  100,  4.40),
    (van_id, 101, 200,  3.80),
    (van_id, 200, null, 3.20);

  -- First Class
  insert into public.pricing_tiers (category_id, min_km, max_km, rate_per_km) values
    (first_class_id, 20,  30,   7.80),
    (first_class_id, 31,  50,   7.50),
    (first_class_id, 51,  100,  7.00),
    (first_class_id, 101, 200,  5.00),
    (first_class_id, 200, null, 4.00);
end $$;
