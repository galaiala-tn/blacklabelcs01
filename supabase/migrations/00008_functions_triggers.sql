-- =========================================================
-- 00008: Functions & Triggers
-- =========================================================

-- ---------------------------------------------------------
-- 1. Generic updated_at maintenance
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','customers','chauffeurs','vehicle_categories','vehicles',
    'reservations','payments'
  ] loop
    execute format(
      'drop trigger if exists trg_set_updated_at on public.%I; '
      'create trigger trg_set_updated_at before update on public.%I '
      'for each row execute function public.set_updated_at();', t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------
-- 2. Auto-create a profile row when a new auth.users row appears.
--    Role and full_name are read from signup metadata:
--    supabase.auth.signUp({ data: { full_name, role } })
-- ---------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, role, full_name, email, phone)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::app_role, 'customer'),
    coalesce(new.raw_user_meta_data->>'full_name', 'New User'),
    new.email,
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;

  -- Fan out to role-specific table
  if coalesce((new.raw_user_meta_data->>'role')::app_role, 'customer') = 'customer' then
    insert into public.customers (id) values (new.id) on conflict (id) do nothing;
  elsif (new.raw_user_meta_data->>'role')::app_role = 'chauffeur' then
    insert into public.chauffeurs (id, license_number)
    values (new.id, coalesce(new.raw_user_meta_data->>'license_number', 'PENDING'))
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_handle_new_auth_user on auth.users;
create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------
-- 3. Log every reservation status change automatically
-- ---------------------------------------------------------
create or replace function public.log_reservation_status_change()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') or (new.status is distinct from old.status) then
    insert into public.reservation_status_history (reservation_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_reservation_status_insert on public.reservations;
create trigger trg_log_reservation_status_insert
  after insert on public.reservations
  for each row execute function public.log_reservation_status_change();

drop trigger if exists trg_log_reservation_status_update on public.reservations;
create trigger trg_log_reservation_status_update
  after update of status on public.reservations
  for each row execute function public.log_reservation_status_change();

-- ---------------------------------------------------------
-- 4. Keep chauffeurs.current_location (geography) in sync with
--    the plain lat/lng columns whenever they're updated.
-- ---------------------------------------------------------
create or replace function public.sync_chauffeur_geography()
returns trigger language plpgsql as $$
begin
  if new.current_lat is not null and new.current_lng is not null then
    new.current_location = geography(st_setsrid(st_makepoint(new.current_lng, new.current_lat), 4326));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_chauffeur_geography on public.chauffeurs;
create trigger trg_sync_chauffeur_geography
  before insert or update of current_lat, current_lng on public.chauffeurs
  for each row execute function public.sync_chauffeur_geography();

-- ---------------------------------------------------------
-- 5. Auto-assign invoice_number on insert if not provided
-- ---------------------------------------------------------
create or replace function public.assign_invoice_number()
returns trigger language plpgsql as $$
begin
  if new.invoice_number is null then
    new.invoice_number := public.generate_invoice_number();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_invoice_number on public.invoices;
create trigger trg_assign_invoice_number
  before insert on public.invoices
  for each row execute function public.assign_invoice_number();
