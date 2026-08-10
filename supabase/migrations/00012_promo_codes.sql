-- =========================================================
-- 00012: Promo Codes / Discounts
-- =========================================================

do $$ begin
  create type promo_discount_type as enum ('percent', 'flat');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.promo_codes (
  id                      uuid primary key default gen_random_uuid(),
  code                    text not null unique,        -- stored uppercase, e.g. 'WELCOME20'
  description             text,
  discount_type           promo_discount_type not null,
  discount_value          numeric(10,2) not null,        -- percent (0-100) or flat $ amount depending on discount_type
  max_discount_amount     numeric(10,2),                 -- caps a percent discount; null = uncapped
  min_trip_amount         numeric(10,2) not null default 0,
  valid_from              timestamptz not null default now(),
  valid_until             timestamptz,                   -- null = no expiry
  max_total_uses          integer,                       -- null = unlimited
  max_uses_per_customer   integer not null default 1,
  times_used              integer not null default 0,
  applicable_category_ids uuid[],                        -- null = applies to all categories
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),

  constraint chk_discount_value_positive check (discount_value > 0),
  constraint chk_percent_range check (discount_type <> 'percent' or discount_value <= 100)
);

create index if not exists idx_promo_codes_code on public.promo_codes(upper(code));

create table if not exists public.promo_code_redemptions (
  id              uuid primary key default gen_random_uuid(),
  promo_code_id   uuid not null references public.promo_codes(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  reservation_id  uuid not null unique references public.reservations(id) on delete cascade,
  discount_amount numeric(10,2) not null,
  redeemed_at     timestamptz not null default now()
);

create index if not exists idx_promo_redemptions_customer on public.promo_code_redemptions(customer_id, promo_code_id);

-- ---------------------------------------------------------
-- Reservations: track which promo (if any) was applied and how much
-- was discounted, so invoices/history stay accurate after the promo
-- itself might later change or expire.
-- ---------------------------------------------------------
alter table public.reservations
  add column if not exists promo_code_id   uuid references public.promo_codes(id) on delete set null,
  add column if not exists discount_amount numeric(10,2) not null default 0;

comment on column public.reservations.discount_amount is
  'Amount subtracted from subtotal before the tax multiplier is applied.';