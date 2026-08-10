-- =========================================================
-- 00013: Pricing function update — support promo discounts
-- =========================================================
-- Adds an optional p_discount parameter (default 0) so existing callers
-- from migration 00010 keep working unchanged. Discount is subtracted
-- from the subtotal BEFORE the tax multiplier, and clamped so the
-- discounted subtotal never goes negative.

create or replace function public.calculate_final_price(
  p_base numeric,
  p_stops numeric,
  p_options numeric,
  p_discount numeric default 0
)
returns numeric
language plpgsql stable
as $$
declare
  multiplier numeric;
  subtotal   numeric;
  discounted numeric;
begin
  select value into multiplier from public.pricing_settings where key = 'service_tax_multiplier';
  subtotal := coalesce(p_base,0) + coalesce(p_stops,0) + coalesce(p_options,0);
  discounted := greatest(subtotal - coalesce(p_discount, 0), 0);
  return round(discounted * multiplier, 2);
end;
$$;

-- ---------------------------------------------------------
-- Helper: validate + compute a promo code's discount for a given
-- customer/subtotal, without redeeming it. The backend calls this to
-- preview the discount, then records the actual redemption itself
-- (application-layer transaction, since redemption also needs the
-- final reservation id which doesn't exist yet at quote time).
-- ---------------------------------------------------------
create or replace function public.preview_promo_discount(
  p_code text,
  p_customer_id uuid,
  p_subtotal numeric,
  p_category_id uuid
)
returns numeric
language plpgsql stable
as $$
declare
  promo record;
  customer_uses integer;
  discount numeric;
begin
  select * into promo from public.promo_codes
  where upper(code) = upper(p_code) and is_active = true
  limit 1;

  if promo is null then
    raise exception 'Invalid or inactive promo code';
  end if;

  if promo.valid_from > now() or (promo.valid_until is not null and promo.valid_until < now()) then
    raise exception 'Promo code is not currently valid';
  end if;

  if promo.max_total_uses is not null and promo.times_used >= promo.max_total_uses then
    raise exception 'Promo code has reached its usage limit';
  end if;

  if promo.applicable_category_ids is not null
     and not (p_category_id = any(promo.applicable_category_ids)) then
    raise exception 'Promo code is not valid for this vehicle category';
  end if;

  if p_subtotal < promo.min_trip_amount then
    raise exception 'Trip amount is below the minimum required for this promo code';
  end if;

  select count(*) into customer_uses
  from public.promo_code_redemptions
  where promo_code_id = promo.id and customer_id = p_customer_id;

  if customer_uses >= promo.max_uses_per_customer then
    raise exception 'You have already used this promo code the maximum number of times';
  end if;

  if promo.discount_type = 'percent' then
    discount := p_subtotal * (promo.discount_value / 100);
    if promo.max_discount_amount is not null then
      discount := least(discount, promo.max_discount_amount);
    end if;
  else
    discount := promo.discount_value;
  end if;

  return round(least(discount, p_subtotal), 2);
end;
$$;
