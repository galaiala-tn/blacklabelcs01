-- =========================================================
-- 00002: Profiles, Customers, Chauffeurs
-- =========================================================
-- We rely on Supabase Auth (auth.users) for authentication.
-- `profiles` is a 1:1 extension of auth.users holding app-level
-- data (role, name, phone, avatar). Customer- and chauffeur-
-- specific data live in their own tables (1:1 with profiles).
-- ---------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          app_role not null default 'customer',
  full_name     text not null,
  email         text not null unique,
  phone         text,
  avatar_url    text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.profiles is 'App-level profile for every authenticated user (customer, admin, chauffeur).';

create table if not exists public.customers (
  id                 uuid primary key references public.profiles(id) on delete cascade,
  default_payment_id text,               -- e.g. Stripe payment method id
  loyalty_points     integer not null default 0,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.chauffeurs (
  id                  uuid primary key references public.profiles(id) on delete cascade,
  license_number      text not null,
  license_expiry      date,
  status              chauffeur_status not null default 'offline',
  current_lat         double precision,
  current_lng         double precision,
  current_location    geography(Point, 4326),
  rating_avg          numeric(3,2) default 5.00,
  vehicle_id          uuid,               -- FK added after vehicles table exists
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_chauffeurs_status on public.chauffeurs(status);
create index if not exists idx_chauffeurs_location on public.chauffeurs using gist(current_location);
