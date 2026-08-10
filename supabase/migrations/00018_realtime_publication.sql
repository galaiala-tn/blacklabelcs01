-- =========================================================
-- 00018: Enable Realtime Replication
-- =========================================================
-- Push delivery for this app is Supabase Realtime, not FCM/APNs.
-- Adding a table to the `supabase_realtime` publication makes Postgres
-- stream INSERT/UPDATE/DELETE events on it to any subscribed client
-- (filtered by RLS), which is what the Flutter app listens to for:
--   - live in-app notifications (notifications table)
--   - live chat messages (chat_messages table)
--
-- NOTE: on a hosted Supabase project this publication already exists by
-- default; this migration is idempotent (safe to re-run) either way.
-- ---------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception
  when undefined_object then
    -- `supabase_realtime` publication doesn't exist in this environment
    -- (e.g. local plain Postgres without the Supabase realtime extension).
    -- No-op: hosted Supabase projects always have it.
    null;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
exception
  when undefined_object then
    null;
end $$;
