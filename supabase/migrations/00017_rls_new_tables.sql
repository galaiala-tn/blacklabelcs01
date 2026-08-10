-- =========================================================
-- 00017: RLS for new tables (reviews, promo codes, recurring bookings, chat)
-- =========================================================

-- ---------------------------------------------------------
-- reviews
-- ---------------------------------------------------------
alter table public.reviews enable row level security;

create policy "reviews_select_involved_or_public" on public.reviews
  for select using (true); -- reviews are shown publicly (e.g. chauffeur rating), content is non-sensitive

create policy "reviews_insert_own_customer" on public.reviews
  for insert with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.reservations r
      where r.id = reservation_id and r.customer_id = auth.uid() and r.status = 'completed'
    )
  );

create policy "reviews_admin_manage" on public.reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------
-- promo_codes / redemptions
-- ---------------------------------------------------------
alter table public.promo_codes enable row level security;
alter table public.promo_code_redemptions enable row level security;

create policy "promo_codes_active_public_read" on public.promo_codes
  for select using (is_active = true or public.is_admin());

create policy "promo_codes_admin_write" on public.promo_codes
  for all using (public.is_admin()) with check (public.is_admin());

create policy "promo_redemptions_own_or_admin" on public.promo_code_redemptions
  for select using (customer_id = auth.uid() or public.is_admin());

create policy "promo_redemptions_insert_own" on public.promo_code_redemptions
  for insert with check (customer_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------
-- recurring_bookings
-- ---------------------------------------------------------
alter table public.recurring_bookings enable row level security;

create policy "recurring_bookings_owner_or_admin" on public.recurring_bookings
  for all using (customer_id = auth.uid() or public.is_admin())
  with check (customer_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------
-- chat_messages
-- ---------------------------------------------------------
alter table public.chat_messages enable row level security;

create policy "chat_messages_via_parent_reservation" on public.chat_messages
  for select using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and (r.customer_id = auth.uid() or r.chauffeur_id = auth.uid() or public.is_admin())
    )
  );

create policy "chat_messages_insert_via_parent_reservation" on public.chat_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and (r.customer_id = auth.uid() or r.chauffeur_id = auth.uid())
    )
  );

create policy "chat_messages_mark_read" on public.chat_messages
  for update using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id
        and (r.customer_id = auth.uid() or r.chauffeur_id = auth.uid() or public.is_admin())
    )
  );
