-- =========================================================
-- 00020: Trip Sharing (public, tokenized links)
-- =========================================================
-- A customer creates a share link for an active reservation; anyone with
-- the token can view trip status + chauffeur location WITHOUT an account.
-- The token itself is the access control — treat it like a bearer secret
-- (long, random, single-purpose, expiring).

create table if not exists public.trip_share_tokens (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  token           text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by      uuid not null references public.customers(id) on delete cascade,
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_trip_share_tokens_reservation on public.trip_share_tokens(reservation_id);

comment on table public.trip_share_tokens is
  'Public share links for live trip tracking. Backend serves a read-only,
   unauthenticated view scoped to exactly this reservation when given a
   valid, non-expired, non-revoked token.';