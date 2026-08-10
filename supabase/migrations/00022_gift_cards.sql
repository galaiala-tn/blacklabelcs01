-- =========================================================
-- 00022: Gift Cards
-- =========================================================

create table if not exists public.gift_cards (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  initial_value     numeric(10,2) not null check (initial_value > 0),
  remaining_value   numeric(10,2) not null,
  is_active         boolean not null default true,
  expires_at        timestamptz,
  purchased_by      uuid references public.customers(id) on delete set null,  -- null if issued by admin as a promo
  created_at        timestamptz not null default now(),

  constraint chk_remaining_not_negative check (remaining_value >= 0),
  constraint chk_remaining_not_over_initial check (remaining_value <= initial_value)
);

create index if not exists idx_gift_cards_code on public.gift_cards(upper(code));

create table if not exists public.gift_card_redemptions (
  id              uuid primary key default gen_random_uuid(),
  gift_card_id    uuid not null references public.gift_cards(id) on delete cascade,
  customer_id     uuid not null references public.customers(id) on delete cascade,
  amount          numeric(10,2) not null check (amount > 0),
  redeemed_at     timestamptz not null default now()
);

create index if not exists idx_gift_card_redemptions_customer on public.gift_card_redemptions(customer_id);

-- Redeems up to the full remaining value of a gift card into the calling
-- customer's credit balance (via credit_transactions), atomically. Returns
-- the amount actually credited.
create or replace function public.redeem_gift_card(p_code text, p_customer_id uuid)
returns numeric
language plpgsql
as $$
declare
  card record;
  amount_to_credit numeric;
begin
  select * into card from public.gift_cards
  where upper(code) = upper(p_code)
  for update; -- lock the row for the duration of this transaction

  if card is null then
    raise exception 'Gift card not found';
  end if;
  if not card.is_active then
    raise exception 'This gift card is no longer active';
  end if;
  if card.expires_at is not null and card.expires_at < now() then
    raise exception 'This gift card has expired';
  end if;
  if card.remaining_value <= 0 then
    raise exception 'This gift card has already been fully redeemed';
  end if;

  amount_to_credit := card.remaining_value;

  update public.gift_cards
  set remaining_value = 0, is_active = false
  where id = card.id;

  insert into public.gift_card_redemptions (gift_card_id, customer_id, amount)
  values (card.id, p_customer_id, amount_to_credit);

  insert into public.credit_transactions (customer_id, amount, type, description)
  values (p_customer_id, amount_to_credit, 'gift_card_redemption', 'Gift card ' || upper(card.code));

  return amount_to_credit;
end;
$$;