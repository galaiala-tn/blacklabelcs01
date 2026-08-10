-- =========================================================
-- 00015: Chat Messages (customer <-> chauffeur, per reservation)
-- =========================================================

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  sender_id       uuid not null references public.profiles(id) on delete cascade,
  message         text not null,
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists idx_chat_messages_reservation on public.chat_messages(reservation_id, created_at);