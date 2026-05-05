-- ============================================================
-- MIGRATIONS NOVAS — Cole tudo isso no Supabase SQL Editor
-- Projeto: lwpcbvwetacbuznynmri
-- Data: 2026-05-05
-- ============================================================

-- ============================================================
-- 1) F021 — Política de cancelamento em contracts
-- ============================================================
alter table public.contracts
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_fee numeric(10,2) default 0,
  add column if not exists cancelled_at timestamptz;

create index if not exists idx_contracts_cancelled_at
  on public.contracts (cancelled_at desc)
  where cancelled_at is not null;

-- ============================================================
-- 2) F027 — Sistema de avaliações de barbeiros
-- ============================================================
create table if not exists public.barber_ratings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  barber_profile_id uuid not null references public.barber_profiles(id) on delete cascade,
  check_in_id uuid references public.check_ins(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists idx_barber_ratings_barber_profile_id
  on public.barber_ratings (barber_profile_id);

create index if not exists idx_barber_ratings_check_in_id
  on public.barber_ratings (check_in_id);

create unique index if not exists idx_barber_ratings_check_in_unique
  on public.barber_ratings (check_in_id)
  where check_in_id is not null;

alter table public.barber_ratings enable row level security;

drop policy if exists "Barber can view own ratings" on public.barber_ratings;
create policy "Barber can view own ratings"
  on public.barber_ratings for select
  using (barber_profile_id in (
    select id from public.barber_profiles where user_id = auth.uid()
  ));

drop policy if exists "Owner can view org ratings" on public.barber_ratings;
create policy "Owner can view org ratings"
  on public.barber_ratings for select
  using (organization_id in (
    select id from public.organizations where owner_id = auth.uid()
  ));

drop policy if exists "Authenticated can insert rating" on public.barber_ratings;
create policy "Authenticated can insert rating"
  on public.barber_ratings for insert
  with check (auth.uid() is not null);

-- ============================================================
-- 3) F022 — Log de auditoria
-- ============================================================
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_organization_id
  on public.audit_logs (organization_id, created_at desc);

create index if not exists idx_audit_logs_user_id
  on public.audit_logs (user_id, created_at desc);

create index if not exists idx_audit_logs_entity
  on public.audit_logs (entity, entity_id);

alter table public.audit_logs enable row level security;

drop policy if exists "Owner can view audit logs" on public.audit_logs;
create policy "Owner can view audit logs"
  on public.audit_logs for select
  using (organization_id in (
    select id from public.organizations where owner_id = auth.uid()
  ));

drop policy if exists "Authenticated can insert audit log" on public.audit_logs;
create policy "Authenticated can insert audit log"
  on public.audit_logs for insert
  with check (auth.uid() is not null);

-- ============================================================
-- Fim
-- ============================================================
