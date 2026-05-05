-- F025 — Registro real de consentimento LGPD
-- Salva no banco o aceite do usuário para rastreabilidade

create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  consent_type text not null default 'lgpd_v1',
  consented_at timestamptz not null default now(),
  user_agent text,
  -- Para usuários anônimos, usa fingerprint de sessão
  session_id text
);

create index if not exists idx_consent_records_user_id
  on public.consent_records (user_id);

create index if not exists idx_consent_records_consented_at
  on public.consent_records (consented_at desc);

alter table public.consent_records enable row level security;

-- Usuário autenticado vê seus próprios registros
drop policy if exists "User can view own consent" on public.consent_records;
create policy "User can view own consent"
  on public.consent_records for select
  using (user_id = auth.uid());

-- Qualquer um pode inserir (anônimo ou autenticado)
drop policy if exists "Anyone can insert consent" on public.consent_records;
create policy "Anyone can insert consent"
  on public.consent_records for insert
  with check (true);
