-- =========================================================
-- 00019: Tips
-- =========================================================

create table if not exists public.tips (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null unique references public.reservations(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  chauffeur_id    uuid not null references public.chauffeurs(id) on delete cascade,
  amount          numeric(10,2) not null check (amount > 0),
  payment_id      uuid references public.payments(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_tips_chauffeur on public.tips(chauffeur_id);
create index if not exists idx_tips_customer on public.tips(customer_id);

-- Extend the earnings view (Phase 4) to include tips. Chauffeur keeps the
-- full tip amount — no platform commission on tips, unlike the trip fare.
drop view if exists public.chauffeur_earnings;

create view public.chauffeur_earnings as
select
  r.id as reservation_id,
  r.chauffeur_id,
  r.total_price,
  round(r.total_price * (1 - (select value from public.pricing_settings where key = 'chauffeur_commission_percent') / 100), 2) as fare_earning,
  coalesce(t.amount, 0) as tip_amount,
  round(r.total_price * (1 - (select value from public.pricing_settings where key = 'chauffeur_commission_percent') / 100), 2) + coalesce(t.amount, 0) as chauffeur_earning,
  r.completed_at,
  r.created_at
from public.reservations r
left join public.tips t on t.reservation_id = r.id
where r.status = 'completed' and r.chauffeur_id is not null;