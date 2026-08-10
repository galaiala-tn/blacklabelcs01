-- =========================================================
-- 00021: Customer Credits (referral rewards + gift cards land here)
-- =========================================================

do $$ begin
  create type credit_transaction_type as enum (
    'referral_reward', 'gift_card_redemption', 'trip_redemption', 'admin_adjustment', 'refund'
  );
exception
  when duplicate_object then null;
end $$;

alter table public.customers
  add column if not exists credit_balance numeric(10,2) not null default 0;

create table if not exists public.credit_transactions (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.customers(id) on delete cascade,
  amount              numeric(10,2) not null,        -- positive = credited, negative = spent
  type                credit_transaction_type not null,
  description         text,
  related_reservation_id uuid references public.reservations(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_credit_transactions_customer on public.credit_transactions(customer_id);

-- Keeps customers.credit_balance authoritative and in sync with the ledger,
-- so the balance is never hand-maintained by application code.
create or replace function public.apply_credit_transaction()
returns trigger language plpgsql as $$
begin
  update public.customers
  set credit_balance = credit_balance + new.amount
  where id = new.customer_id;
  return new;
end;
$$;

drop trigger if exists trg_apply_credit_transaction on public.credit_transactions;
create trigger trg_apply_credit_transaction
  after insert on public.credit_transactions
  for each row execute function public.apply_credit_transaction();

-- ---------------------------------------------------------
-- Referrals
-- ---------------------------------------------------------
alter table public.profiles
  add column if not exists referral_code text unique,
  add column if not exists referred_by uuid references public.profiles(id) on delete set null;

insert into public.pricing_settings (key, value, description) values
  ('referral_reward_amount', 10, 'Credit (in $) granted to BOTH the referrer and the referee when the referee completes their first trip.')
on conflict (key) do nothing;

-- Short, unique, human-shareable code (e.g. "BL-K3F9A2"), generated once per profile.
create or replace function public.generate_referral_code()
returns text language plpgsql as $$
declare
  candidate text;
  exists_already boolean;
begin
  loop
    candidate := 'BL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    select exists(select 1 from public.profiles where referral_code = candidate) into exists_already;
    exit when not exists_already;
  end loop;
  return candidate;
end;
$$;

create or replace function public.assign_referral_code()
returns trigger language plpgsql as $$
begin
  if new.referral_code is null then
    new.referral_code := public.generate_referral_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_referral_code on public.profiles;
create trigger trg_assign_referral_code
  before insert on public.profiles
  for each row execute function public.assign_referral_code();

-- Grants the referral reward to both parties the first time the referee's
-- reservation reaches 'completed' — never on subsequent trips.
create or replace function public.grant_referral_reward_on_first_completion()
returns trigger language plpgsql as $$
declare
  referee_profile_id uuid;
  referrer_id uuid;
  reward numeric;
  already_rewarded boolean;
  is_first_completed_trip boolean;
begin
  if new.status <> 'completed' or (old.status is not distinct from 'completed') then
    return new;
  end if;

  referee_profile_id := new.customer_id;

  select referred_by into referrer_id from public.profiles where id = referee_profile_id;
  if referrer_id is null then
    return new; -- this customer wasn't referred by anyone
  end if;

  select not exists (
    select 1 from public.reservations
    where customer_id = referee_profile_id and status = 'completed' and id <> new.id
  ) into is_first_completed_trip;

  if not is_first_completed_trip then
    return new; -- reward only fires on the referee's FIRST completed trip
  end if;

  select exists(
    select 1 from public.credit_transactions
    where type = 'referral_reward' and related_reservation_id = new.id
  ) into already_rewarded;
  if already_rewarded then
    return new;
  end if;

  select value into reward from public.pricing_settings where key = 'referral_reward_amount';

  insert into public.credit_transactions (customer_id, amount, type, description, related_reservation_id)
  values
    (referrer_id, reward, 'referral_reward', 'Referral reward — your friend completed their first trip', new.id),
    (referee_profile_id, reward, 'referral_reward', 'Referral reward — welcome bonus', new.id);

  return new;
end;
$$;

drop trigger if exists trg_grant_referral_reward on public.reservations;
create trigger trg_grant_referral_reward
  after update of status on public.reservations
  for each row execute function public.grant_referral_reward_on_first_completion();