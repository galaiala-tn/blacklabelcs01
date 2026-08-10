-- =========================================================
-- 00024: RLS for tips, trip sharing, credits, gift cards
-- =========================================================

-- ---------------------------------------------------------
-- tips
-- ---------------------------------------------------------
alter table public.tips enable row level security;

create policy "tips_select_involved_or_admin" on public.tips
  for select using (customer_id = auth.uid() or chauffeur_id = auth.uid() or public.is_admin());

create policy "tips_insert_own_customer" on public.tips
  for insert with check (
    customer_id = auth.uid()
    and exists (
      select 1 from public.reservations r
      where r.id = reservation_id and r.customer_id = auth.uid() and r.status = 'completed'
    )
  );

-- ---------------------------------------------------------
-- trip_share_tokens
-- ---------------------------------------------------------
alter table public.trip_share_tokens enable row level security;

create policy "trip_share_tokens_owner_or_admin" on public.trip_share_tokens
  for all using (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

-- NOTE: the public (unauthenticated) share-link view is served by the
-- backend using the service-role key (bypasses RLS entirely), scoped down
-- to exactly the requested token server-side — it does not rely on a
-- public RLS policy here.

-- ---------------------------------------------------------
-- credit_transactions
-- ---------------------------------------------------------
alter table public.credit_transactions enable row level security;

create policy "credit_transactions_own_or_admin" on public.credit_transactions
  for select using (customer_id = auth.uid() or public.is_admin());

create policy "credit_transactions_admin_write" on public.credit_transactions
  for insert with check (public.is_admin());

-- ---------------------------------------------------------
-- gift_cards / redemptions
-- ---------------------------------------------------------
alter table public.gift_cards enable row level security;
alter table public.gift_card_redemptions enable row level security;

create policy "gift_cards_admin_manage" on public.gift_cards
  for all using (public.is_admin()) with check (public.is_admin());

create policy "gift_card_redemptions_own_or_admin" on public.gift_card_redemptions
  for select using (customer_id = auth.uid() or public.is_admin());
