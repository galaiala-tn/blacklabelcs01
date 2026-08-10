-- =========================================================
-- 00005: Locations, Reservations, Reservation Stops
-- =========================================================

create table if not exists public.locations (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid references public.customers(id) on delete cascade,
  label           text,                 -- 'Home', 'Office', etc. (nullable for one-off addresses)
  formatted_address text not null,
  place_id        text,                 -- Google Places place_id
  lat             double precision not null,
  lng             double precision not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_locations_customer on public.locations(customer_id);

create table if not exists public.reservations (
  id                    uuid primary key default gen_random_uuid(),
  reference_code        text not null unique default ('BL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),

  customer_id           uuid not null references public.customers(id) on delete restrict,
  chauffeur_id          uuid references public.chauffeurs(id) on delete set null,
  vehicle_id            uuid references public.vehicles(id) on delete set null,
  category_id           uuid not null references public.vehicle_categories(id) on delete restrict,

  type                  reservation_type not null,
  status                reservation_status not null default 'pending',

  -- Pickup / destination
  pickup_address        text not null,
  pickup_lat            double precision not null,
  pickup_lng            double precision not null,
  destination_address   text,           -- null allowed for pure hourly service w/o fixed destination
  destination_lat       double precision,
  destination_lng       double precision,

  scheduled_at          timestamptz not null,     -- requested pickup date/time

  -- One Way Transfer specifics
  distance_km           numeric(8,2),
  duration_minutes      integer,                  -- estimated route duration

  -- Hourly Chauffeur specifics
  booked_hours          integer,                  -- minimum 3, enforced at app layer + check below

  -- Extra info
  flight_number         text,
  train_number          text,
  notes_for_chauffeur   text,
  meet_and_greet         boolean not null default false,

  -- Pricing breakdown (computed server-side, stored for audit/history)
  base_price            numeric(10,2) not null default 0,
  stops_price            numeric(10,2) not null default 0,
  options_price          numeric(10,2) not null default 0,
  subtotal              numeric(10,2) not null default 0,   -- base + stops + options
  tax_multiplier_applied numeric(10,4) not null default 1.199,
  total_price           numeric(10,2) not null default 0,   -- subtotal * multiplier

  cancelled_reason       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint chk_hourly_min_hours check (
    type <> 'hourly_chauffeur' or booked_hours is null or booked_hours >= 3
  )
);

create index if not exists idx_reservations_customer on public.reservations(customer_id);
create index if not exists idx_reservations_chauffeur on public.reservations(chauffeur_id);
create index if not exists idx_reservations_status on public.reservations(status);
create index if not exists idx_reservations_scheduled_at on public.reservations(scheduled_at);

create table if not exists public.reservation_stops (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  order_index     integer not null,
  address         text not null,
  lat             double precision not null,
  lng             double precision not null,
  extra_distance_km numeric(8,2) not null default 0,   -- distance this stop adds to the route
  extra_price     numeric(10,2) not null default 0,
  created_at      timestamptz not null default now(),

  unique (reservation_id, order_index)
);

create index if not exists idx_reservation_stops_reservation on public.reservation_stops(reservation_id);

-- Chauffeur-facing trip status log (fine-grained, drives push notifications)
create table if not exists public.reservation_status_history (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  status          reservation_status not null,
  changed_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_status_history_reservation on public.reservation_status_history(reservation_id);