-- =========================================================
-- 00025: Track applied account credit on reservations
-- =========================================================

alter table public.reservations
  add column if not exists credit_applied numeric(10,2) not null default 0;

comment on column public.reservations.credit_applied is
  'Amount deducted from the customer''s credit_balance for this trip
   (referral rewards / gift cards), applied after the promo discount,
   before the tax multiplier.';
