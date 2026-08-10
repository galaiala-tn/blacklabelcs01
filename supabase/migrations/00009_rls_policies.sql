-- =========================================================
-- 00009: Row Level Security
-- =========================================================
-- Access model:
--  - admin        : full access to everything
--  - customer     : full access to own rows only
--  - chauffeur     : access to their own profile, their assigned
--                    reservations, and tracking they generate
-- The NestJS backend uses the Supabase service role for admin
-- operations, but RLS is still enforced for any direct client
-- access (e.g. Flutter using the anon/user JWT for read-heavy
-- screens like reservation history).
-- ---------------------------------------------------------

create or replace function public.current_role_is(required app_role)
returns boolean language sql stable as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = required
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select public.current_role_is('admin');
$$;

-- ---------------------------------------------------------
-- profiles
-- ---------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

create policy "profiles_admin_insert" on public.profiles
  for insert with check (public.is_admin() or id = auth.uid());

-- ---------------------------------------------------------
-- customers
-- ---------------------------------------------------------
alter table public.customers enable row level security;

create policy "customers_select_own_or_admin" on public.customers
  for select using (id = auth.uid() or public.is_admin());

create policy "customers_update_own_or_admin" on public.customers
  for update using (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------
-- chauffeurs
-- ---------------------------------------------------------
alter table public.chauffeurs enable row level security;

create policy "chauffeurs_select_own_admin_or_public_basic" on public.chauffeurs
  for select using (id = auth.uid() or public.is_admin() or public.current_role_is('customer'));
  -- customers can read chauffeur basics (name via profiles) once assigned; refine at API layer

create policy "chauffeurs_update_own_or_admin" on public.chauffeurs
  for update using (id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------
-- vehicle_categories / vehicles — public read, admin write
-- ---------------------------------------------------------
alter table public.vehicle_categories enable row level security;
alter table public.vehicles enable row level security;
alter table public.pricing_tiers enable row level security;
alter table public.pricing_settings enable row level security;

create policy "categories_public_read" on public.vehicle_categories for select using (true);
create policy "categories_admin_write" on public.vehicle_categories for all using (public.is_admin()) with check (public.is_admin());

create policy "vehicles_public_read" on public.vehicles for select using (true);
create policy "vehicles_admin_write" on public.vehicles for all using (public.is_admin()) with check (public.is_admin());

create policy "pricing_tiers_public_read" on public.pricing_tiers for select using (true);
create policy "pricing_tiers_admin_write" on public.pricing_tiers for all using (public.is_admin()) with check (public.is_admin());

create policy "pricing_settings_public_read" on public.pricing_settings for select using (true);
create policy "pricing_settings_admin_write" on public.pricing_settings for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- locations
-- ---------------------------------------------------------
alter table public.locations enable row level security;

create policy "locations_owner_or_admin" on public.locations
  for all using (customer_id = auth.uid() or public.is_admin())
  with check (customer_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------
-- reservations
-- ---------------------------------------------------------
alter table public.reservations enable row level security;

create policy "reservations_select_involved_or_admin" on public.reservations
  for select using (
    customer_id = auth.uid()
    or chauffeur_id = auth.uid()
    or public.is_admin()
  );

create policy "reservations_insert_own_customer" on public.reservations
  for insert with check (customer_id = auth.uid() or public.is_admin());

create policy "reservations_update_involved_or_admin" on public.reservations
  for update using (
    customer_id = auth.uid()
    or chauffeur_id = auth.uid()
    or public.is_admin()
  );

-- ---------------------------------------------------------
-- reservation_stops
-- ---------------------------------------------------------
alter table public.reservation_stops enable row level security;

create policy "stops_via_parent_reservation" on public.reservation_stops
  for all using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and (r.customer_id = auth.uid() or r.chauffeur_id = auth.uid() or public.is_admin())
    )
  );

-- ---------------------------------------------------------
-- reservation_status_history — read-only for involved parties
-- ---------------------------------------------------------
alter table public.reservation_status_history enable row level security;

create policy "status_history_via_parent_reservation" on public.reservation_status_history
  for select using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and (r.customer_id = auth.uid() or r.chauffeur_id = auth.uid() or public.is_admin())
    )
  );

-- ---------------------------------------------------------
-- payments
-- ---------------------------------------------------------
alter table public.payments enable row level security;

create policy "payments_owner_or_admin" on public.payments
  for select using (customer_id = auth.uid() or public.is_admin());

create policy "payments_admin_write" on public.payments
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- invoices
-- ---------------------------------------------------------
alter table public.invoices enable row level security;

create policy "invoices_owner_or_admin" on public.invoices
  for select using (customer_id = auth.uid() or public.is_admin());

create policy "invoices_admin_write" on public.invoices
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- notifications
-- ---------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications_owner_or_admin" on public.notifications
  for select using (user_id = auth.uid() or public.is_admin());

create policy "notifications_owner_mark_read" on public.notifications
  for update using (user_id = auth.uid() or public.is_admin());

create policy "notifications_admin_insert" on public.notifications
  for insert with check (public.is_admin());

-- ---------------------------------------------------------
-- tracking_history
-- ---------------------------------------------------------
alter table public.tracking_history enable row level security;

create policy "tracking_insert_own_chauffeur" on public.tracking_history
  for insert with check (chauffeur_id = auth.uid() or public.is_admin());

create policy "tracking_select_involved_or_admin" on public.tracking_history
  for select using (
    chauffeur_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.reservations r
      where r.id = reservation_id and r.customer_id = auth.uid()
    )
  );
