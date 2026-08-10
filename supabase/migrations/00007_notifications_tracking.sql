-- =========================================================
-- 00007: Notifications & Tracking History
-- =========================================================

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  reservation_id  uuid references public.reservations(id) on delete cascade,
  type            notification_type not null default 'general',
  title           text not null,
  body            text not null,
  is_read         boolean not null default false,
  data            jsonb,               -- arbitrary payload (deep link, ids, etc.)
  created_at      timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id, is_read);
create index if not exists idx_notifications_reservation on public.notifications(reservation_id);

-- Live GPS breadcrumb trail per active reservation, used for the
-- real-time tracking map (fed via WebSocket from the chauffeur app).
create table if not exists public.tracking_history (
  id              uuid primary key default gen_random_uuid(),
  reservation_id  uuid not null references public.reservations(id) on delete cascade,
  chauffeur_id    uuid not null references public.chauffeurs(id) on delete cascade,
  lat             double precision not null,
  lng             double precision not null,
  heading         double precision,
  speed_kmh       double precision,
  recorded_at     timestamptz not null default now()
);

create index if not exists idx_tracking_reservation_time on public.tracking_history(reservation_id, recorded_at desc);

-- Keep only recent breadcrumbs hot; older rows can be archived/purged by a cron job.