-- =========================================================
-- 00011: Reviews (customer rates chauffeur after a completed trip)
-- =========================================================

create table if not exists public.reviews (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null unique references public.reservations(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  chauffeur_id    uuid not null references public.chauffeurs(id) on delete cascade,
  rating          smallint not null check (rating between 1 and 5),
  comment         text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_reviews_chauffeur on public.reviews(chauffeur_id);
create index if not exists idx_reviews_customer on public.reviews(customer_id);

-- Keep chauffeurs.rating_avg (added in Phase 1) up to date automatically.
create or replace function public.recompute_chauffeur_rating()
returns trigger language plpgsql as $$
declare
  target_chauffeur uuid;
  avg_rating numeric;
begin
  target_chauffeur := coalesce(new.chauffeur_id, old.chauffeur_id);

  select round(avg(rating)::numeric, 2) into avg_rating
  from public.reviews
  where chauffeur_id = target_chauffeur;

  update public.chauffeurs
  set rating_avg = coalesce(avg_rating, 5.00)
  where id = target_chauffeur;

  return null;
end;
$$;

drop trigger if exists trg_reviews_recompute_rating on public.reviews;
create trigger trg_reviews_recompute_rating
  after insert or update or delete on public.reviews
  for each row execute function public.recompute_chauffeur_rating();