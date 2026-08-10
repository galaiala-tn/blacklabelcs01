-- =========================================================
-- 00016: Chauffeur Earnings — platform commission setting
-- =========================================================

insert into public.pricing_settings (key, value, description) values
  ('chauffeur_commission_percent', 20, 'Percentage of each completed trip''s total_price retained by the platform; the rest is the chauffeur''s earnings.')
on conflict (key) do nothing;

-- Reservations don't track a dedicated completion timestamp yet — add one,
-- set automatically by trigger the moment status flips to 'completed'.
alter table public.reservations
  add column if not exists completed_at timestamptz;

create or replace function public.stamp_reservation_completed_at()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_stamp_reservation_completed_at on public.reservations;
create trigger trg_stamp_reservation_completed_at
  before insert or update of status on public.reservations
  for each row execute function public.stamp_reservation_completed_at();

-- Convenience view: one row per completed trip with the chauffeur's cut
-- already computed, so both the backend and any future reporting can
-- query this directly instead of duplicating the commission math.
create or replace view public.chauffeur_earnings as
select
  r.id as reservation_id,
  r.chauffeur_id,
  r.total_price,
  round(r.total_price * (1 - (select value from public.pricing_settings where key = 'chauffeur_commission_percent') / 100), 2) as chauffeur_earning,
  r.completed_at,
  r.created_at
from public.reservations r
where r.status = 'completed' and r.chauffeur_id is not null;
