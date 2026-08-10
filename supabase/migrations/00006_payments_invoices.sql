-- =========================================================
-- 00006: Payments & Invoices
-- =========================================================

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  reservation_id      uuid not null references public.reservations(id) on delete cascade,
  customer_id         uuid not null references public.customers(id) on delete restrict,
  amount              numeric(10,2) not null,
  currency            text not null default 'USD',
  method              payment_method not null default 'card',
  status              payment_status not null default 'pending',
  provider            text,                 -- e.g. 'stripe'
  provider_ref        text,                 -- payment intent / charge id
  paid_at             timestamptz,
  failure_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_payments_reservation on public.payments(reservation_id);
create index if not exists idx_payments_customer on public.payments(customer_id);
create index if not exists idx_payments_status on public.payments(status);

create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  reservation_id    uuid not null unique references public.reservations(id) on delete cascade,
  payment_id        uuid references public.payments(id) on delete set null,
  customer_id       uuid not null references public.customers(id) on delete restrict,
  invoice_number    text not null unique,
  status            invoice_status not null default 'issued',
  subtotal          numeric(10,2) not null,
  tax_amount        numeric(10,2) not null default 0,
  total_amount      numeric(10,2) not null,
  currency          text not null default 'USD',
  pdf_url           text,                -- storage path/url of generated PDF
  issued_at         timestamptz not null default now(),
  created_at        timestamptz not null default now()
);

create index if not exists idx_invoices_customer on public.invoices(customer_id);

-- Simple sequence-backed invoice numbers: INV-2026-000123
create sequence if not exists public.invoice_number_seq;

create or replace function public.generate_invoice_number()
returns text
language plpgsql
as $$
declare
  next_val bigint;
begin
  next_val := nextval('public.invoice_number_seq');
  return 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(next_val::text, 6, '0');
end;
$$;