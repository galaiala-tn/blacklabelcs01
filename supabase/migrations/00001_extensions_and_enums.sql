-- =========================================================
-- BlackLabel Car Services — 00001: Extensions & Enum Types
-- =========================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "postgis"; -- geo distance / points for locations & tracking

-- ---------------------------------------------------------
-- Enums
-- ---------------------------------------------------------

do $$ begin
  create type app_role as enum ('customer', 'admin', 'chauffeur');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type reservation_type as enum ('one_way_transfer', 'hourly_chauffeur');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type reservation_status as enum (
    'pending',        -- created by customer, awaiting confirmation
    'confirmed',       -- confirmed by admin/system
    'chauffeur_assigned',
    'on_the_way',      -- chauffeur en route to pickup
    'arrived',         -- chauffeur arrived at pickup
    'in_progress',     -- trip started
    'completed',
    'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type chauffeur_trip_status as enum (
    'accepted', 'on_the_way', 'arrived', 'started', 'completed', 'cancelled'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type payment_status as enum ('pending', 'authorized', 'paid', 'failed', 'refunded');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type payment_method as enum ('card', 'apple_pay', 'google_pay', 'cash', 'other');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type invoice_status as enum ('issued', 'paid', 'void');
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type notification_type as enum (
    'reservation_confirmed',
    'chauffeur_assigned',
    'chauffeur_on_the_way',
    'chauffeur_arrived',
    'trip_completed',
    'payment_received',
    'general'
  );
exception
  when duplicate_object then null;
end $$;

do $$ begin
  create type chauffeur_status as enum ('offline', 'available', 'busy');
exception
  when duplicate_object then null;
end $$;
