-- =========================================================
-- 00004: Distance-Tiered Pricing (One Way Transfer) + Global Settings
-- =========================================================
-- For distance > 19km, price is computed per-km using a rate
-- that depends on the distance bracket and vehicle category.
-- Stored as rows so admin can edit rates without a deploy.
-- ---------------------------------------------------------

create table if not exists public.pricing_tiers (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.vehicle_categories(id) on delete cascade,
  min_km          numeric(6,2) not null,   -- inclusive lower bound
  max_km          numeric(6,2),            -- inclusive upper bound; NULL = open-ended (200+ km)
  rate_per_km     numeric(10,2) not null,
  created_at      timestamptz not null default now(),

  constraint chk_pricing_tier_bounds check (max_km is null or max_km >= min_km)
);

create index if not exists idx_pricing_tiers_category on public.pricing_tiers(category_id);

-- Global multipliers / flat fees, editable from the admin dashboard.
create table if not exists public.pricing_settings (
  key           text primary key,
  value         numeric(10,4) not null,
  description   text
);

insert into public.pricing_settings (key, value, description) values
  ('service_tax_multiplier', 1.199, 'Final price multiplier applied to (service + stops + options)'),
  ('meet_and_greet_fee', 30.00, 'Flat fee for the Meet & Greet option'),
  ('one_way_min_distance_km', 19, 'Distance (km) at or below which the flat minimum price applies')
on conflict (key) do nothing;