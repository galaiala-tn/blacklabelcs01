-- =========================================================
-- 00023: Chauffeur Document Verification
-- =========================================================

do $$ begin
  create type verification_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

alter table public.chauffeurs
  add column if not exists license_document_url    text,
  add column if not exists insurance_document_url   text,
  add column if not exists insurance_expiry         date,
  add column if not exists verification_status      verification_status not null default 'pending',
  add column if not exists verification_notes       text,
  add column if not exists verified_at              timestamptz,
  add column if not exists verified_by              uuid references public.profiles(id) on delete set null;

create index if not exists idx_chauffeurs_verification_status on public.chauffeurs(verification_status);

comment on column public.chauffeurs.verification_status is
  'A chauffeur should only be assignable to reservations once approved —
   enforce this in the application layer (ReservationsService.assignChauffeur).';
