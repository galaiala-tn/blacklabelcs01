-- =========================================================
-- 00003: Vehicle Categories & Vehicles
-- =========================================================

create table if not exists public.vehicle_categories (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,        -- 'business' | 'business_van' | 'first_class'
  display_name          text not null,
  description           text,
  image_url             text,
  passenger_capacity    integer not null default 4,
  luggage_capacity      integer not null default 2,

  -- One Way Transfer pricing
  min_price_one_way     numeric(10,2) not null,       -- flat minimum price for distance <= 19km

  -- Hourly Chauffeur Service pricing
  hourly_rate           numeric(10,2) not null,
  min_hours             integer not null default 3,

  -- Intermediate stop pricing (range $/km — admin can pick actual rate within range)
  stop_rate_min_per_km  numeric(10,2) not null,
  stop_rate_max_per_km  numeric(10,2) not null,

  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table public.vehicle_categories is 'Business, Business Van, First Class — base pricing config per category.';

create table if not exists public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  category_id     uuid not null references public.vehicle_categories(id) on delete restrict,
  chauffeur_id    uuid references public.chauffeurs(id) on delete set null,
  make            text not null,
  model            text not null,
  year            integer,
  color           text,
  plate_number    text not null unique,
  photo_url       text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_vehicles_category on public.vehicles(category_id);
create index if not exists idx_vehicles_chauffeur on public.vehicles(chauffeur_id);

alter table public.chauffeurs
  add constraint fk_chauffeurs_vehicle
  foreign key (vehicle_id) references public.vehicles(id) on delete set null;