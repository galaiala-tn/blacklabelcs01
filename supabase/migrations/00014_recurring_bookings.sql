-- =========================================================
-- 00014: Recurring Bookings (templates)
-- =========================================================
-- A recurring_bookings row is a template; a scheduled backend job reads
-- active templates daily and creates a real `reservations` row whenever
-- today matches the template's days_of_week, then stamps
-- last_generated_date so it isn't created twice.

create table if not exists public.recurring_bookings (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           uuid not null references public.customers(id) on delete cascade,
  category_id           uuid not null references public.vehicle_categories(id) on delete restrict,
  type                  reservation_type not null,

  pickup_address        text not null,
  pickup_lat            double precision not null,
  pickup_lng            double precision not null,
  destination_address   text,
  destination_lat       double precision,
  destination_lng       double precision,

  booked_hours          integer,                 -- for hourly_chauffeur templates

  days_of_week          text[] not null,          -- e.g. {'MO','WE','FR'} (ISO 2-letter codes)
  time_of_day           time not null,            -- local pickup time each occurrence

  meet_and_greet         boolean not null default false,
  notes_for_chauffeur    text,

  starts_on             date not null default current_date,
  ends_on                date,                    -- null = indefinite
  last_generated_date    date,

  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint chk_recurring_days_valid check (
    days_of_week <@ array['SU','MO','TU','WE','TH','FR','SA']::text[]
  ),
  constraint chk_recurring_hourly_hours check (
    type <> 'hourly_chauffeur' or (booked_hours is not null and booked_hours >= 3)
  )
);

create index if not exists idx_recurring_bookings_customer on public.recurring_bookings(customer_id);
create index if not exists idx_recurring_bookings_active on public.recurring_bookings(is_active) where is_active = true;

drop trigger if exists trg_set_updated_at on public.recurring_bookings;
create trigger trg_set_updated_at before update on public.recurring_bookings
  for each row execute function public.set_updated_at();

-- Link generated reservations back to the template that spawned them.
alter table public.reservations
  add column if not exists recurring_booking_id uuid references public.recurring_bookings(id) on delete set null;