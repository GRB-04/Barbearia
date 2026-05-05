-- F027 — Sistema de avaliação de barbeiros
-- Tabela de ratings criada por clientes após atendimentos

create table if not exists public.barber_ratings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  barber_profile_id uuid not null references public.barber_profiles(id) on delete cascade,
  check_in_id uuid references public.check_ins(id) on delete set null,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Índices
create index if not exists idx_barber_ratings_barber_profile_id
  on public.barber_ratings (barber_profile_id);

create index if not exists idx_barber_ratings_check_in_id
  on public.barber_ratings (check_in_id);

-- Evitar rating duplicado por check-in
create unique index if not exists idx_barber_ratings_check_in_unique
  on public.barber_ratings (check_in_id)
  where check_in_id is not null;

-- RLS
alter table public.barber_ratings enable row level security;

-- Barbeiro pode ver suas próprias avaliações
create policy "Barber can view own ratings"
  on public.barber_ratings
  for select
  using (
    barber_profile_id in (
      select id from public.barber_profiles where user_id = auth.uid()
    )
  );

-- Owner pode ver todas as avaliações da organização
create policy "Owner can view org ratings"
  on public.barber_ratings
  for select
  using (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );

-- Qualquer usuário autenticado pode inserir avaliação (o barbeiro avalia o atendimento)
create policy "Authenticated can insert rating"
  on public.barber_ratings
  for insert
  with check (auth.uid() is not null);
