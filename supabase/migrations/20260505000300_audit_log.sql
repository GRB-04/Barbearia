-- F022 — Auditoria básica de ações críticas

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,        -- ex: 'contract.created', 'contract.cancelled', 'payment.paid'
  entity text not null,        -- ex: 'contracts', 'payments', 'barbers'
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

-- RLS: somente owner vê os logs da sua org
alter table public.audit_logs enable row level security;

create policy "Owner can view audit logs"
  on public.audit_logs
  for select
  using (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );

-- Qualquer authenticated pode inserir (service role via aplicação)
create policy "Authenticated can insert audit log"
  on public.audit_logs
  for insert
  with check (auth.uid() is not null);
