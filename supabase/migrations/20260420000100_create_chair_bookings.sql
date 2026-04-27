begin;

-- =========================================================
-- 1) EXTENSÃO NECESSÁRIA PARA EXCLUDE CONSTRAINT
-- =========================================================
create extension if not exists btree_gist;

-- =========================================================
-- 2) ENUM DE STATUS DO BOOKING
-- =========================================================
do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'chair_booking_status'
  ) then
    create type public.chair_booking_status as enum (
      'pending',
      'confirmed',
      'cancelled',
      'completed'
    );
  end if;
end
$$;

-- =========================================================
-- 3) TABELA PRINCIPAL DE BOOKINGS
-- =========================================================
create table if not exists public.chair_bookings (
  id uuid primary key default gen_random_uuid(),

  chair_id uuid not null references public.chairs(id) on delete cascade,
  barber_profile_id uuid not null references public.barber_profiles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,

  start_at timestamptz not null,
  end_at timestamptz not null,

  status public.chair_booking_status not null default 'pending',

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chair_bookings_time_order_check
    check (end_at > start_at),

  constraint chair_bookings_minimum_4_hours_check
    check (end_at - start_at >= interval '4 hours')
);

comment on table public.chair_bookings is 'Reservas flexíveis de cadeiras por período. Não substitui contracts.';
comment on column public.chair_bookings.organization_id is 'Organização dona da cadeira reservada.';
comment on column public.chair_bookings.barber_profile_id is 'Barbeiro que realizou a reserva.';
comment on column public.chair_bookings.status is 'pending, confirmed, cancelled, completed';

-- =========================================================
-- 4) UPDATED_AT AUTOMÁTICO
-- =========================================================
create or replace function public.set_current_timestamp_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chair_bookings_set_updated_at on public.chair_bookings;

create trigger trg_chair_bookings_set_updated_at
before update on public.chair_bookings
for each row
execute function public.set_current_timestamp_updated_at();

-- =========================================================
-- 5) ÍNDICES
-- =========================================================
create index if not exists idx_chair_bookings_chair_id
  on public.chair_bookings (chair_id);

create index if not exists idx_chair_bookings_barber_profile_id
  on public.chair_bookings (barber_profile_id);

create index if not exists idx_chair_bookings_organization_id
  on public.chair_bookings (organization_id);

create index if not exists idx_chair_bookings_start_at
  on public.chair_bookings (start_at);

create index if not exists idx_chair_bookings_end_at
  on public.chair_bookings (end_at);

create index if not exists idx_chair_bookings_status
  on public.chair_bookings (status);

-- =========================================================
-- 6) IMPEDIR CONFLITO DE HORÁRIO NA MESMA CADEIRA
--    Só vale para pending/confirmed
-- =========================================================
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chair_bookings_no_overlap_per_chair'
  ) then
    alter table public.chair_bookings
      add constraint chair_bookings_no_overlap_per_chair
      exclude using gist (
        chair_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (status in ('pending', 'confirmed'));
  end if;
end
$$;

-- =========================================================
-- 7) IMPEDIR QUE O MESMO BARBEIRO TENHA DOIS BOOKINGS
--    SOBREPOSTOS AO MESMO TEMPO
-- =========================================================
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'chair_bookings_no_overlap_per_barber'
  ) then
    alter table public.chair_bookings
      add constraint chair_bookings_no_overlap_per_barber
      exclude using gist (
        barber_profile_id with =,
        tstzrange(start_at, end_at, '[)') with &&
      )
      where (status in ('pending', 'confirmed'));
  end if;
end
$$;

-- =========================================================
-- 8) FUNÇÃO AUXILIAR: PEGAR BARBER_PROFILE DO USUÁRIO LOGADO
-- =========================================================
create or replace function public.current_barber_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select bp.id
  from public.barber_profiles bp
  where bp.user_id = auth.uid()
  limit 1;
$$;

-- =========================================================
-- 9) FUNÇÃO AUXILIAR:
--    VALIDA SE O INTERVALO ESTÁ DENTRO DO HORÁRIO DA LOCATION
--
--    Espera que locations.operating_hours seja JSONB neste formato:
--    {
--      "0": { "open": false },
--      "1": { "open": true, "start": "08:00", "end": "18:00" },
--      "2": { "open": true, "start": "08:00", "end": "18:00" },
--      ...
--      "6": { "open": true, "start": "08:00", "end": "22:00" }
--    }
--
--    Observação:
--    0 = domingo
--    1 = segunda
--    2 = terça
--    3 = quarta
--    4 = quinta
--    5 = sexta
--    6 = sábado
-- =========================================================
create or replace function public.is_booking_within_location_hours(
  p_location_operating_hours jsonb,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns boolean
language plpgsql
stable
as $$
declare
  v_start_day int;
  v_end_day int;

  v_start_config jsonb;
  v_end_config jsonb;

  v_start_open boolean;
  v_end_open boolean;

  v_start_hour time;
  v_end_hour time;

  v_start_allowed_start time;
  v_start_allowed_end time;
  v_end_allowed_start time;
  v_end_allowed_end time;
begin
  if p_location_operating_hours is null then
    return false;
  end if;

  if p_end_at <= p_start_at then
    return false;
  end if;

  v_start_day := extract(dow from p_start_at);
  v_end_day := extract(dow from p_end_at);

  -- Nesta primeira versão do MVP, booking deve começar e terminar no mesmo dia.
  if (p_start_at::date <> p_end_at::date) then
    return false;
  end if;

  v_start_config := p_location_operating_hours -> (v_start_day::text);
  v_end_config := p_location_operating_hours -> (v_end_day::text);

  if v_start_config is null or v_end_config is null then
    return false;
  end if;

  v_start_open := coalesce((v_start_config ->> 'open')::boolean, false);
  v_end_open := coalesce((v_end_config ->> 'open')::boolean, false);

  if not v_start_open or not v_end_open then
    return false;
  end if;

  if (v_start_config ->> 'start') is null
     or (v_start_config ->> 'end') is null
     or (v_end_config ->> 'start') is null
     or (v_end_config ->> 'end') is null then
    return false;
  end if;

  v_start_hour := p_start_at::time;
  v_end_hour := p_end_at::time;

  v_start_allowed_start := (v_start_config ->> 'start')::time;
  v_start_allowed_end := (v_start_config ->> 'end')::time;

  v_end_allowed_start := (v_end_config ->> 'start')::time;
  v_end_allowed_end := (v_end_config ->> 'end')::time;

  if v_start_hour < v_start_allowed_start then
    return false;
  end if;

  if v_end_hour > v_end_allowed_end then
    return false;
  end if;

  return true;
end;
$$;

-- =========================================================
-- 10) TRIGGER DE VALIDAÇÃO DE REGRAS DE NEGÓCIO
--     - cadeira pertence à organização
--     - barber pertence à organização? NÃO obrigatório aqui
--       porque agora o barbeiro pode reservar em outra barbearia
--     - cadeira deve estar ativa/disponível
--     - booking deve respeitar horário de funcionamento
-- =========================================================
create or replace function public.validate_chair_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_chair_status text;
  v_location_operating_hours jsonb;
  v_location_organization_id uuid;
begin
  -- chair -> location -> organization
  select
    c.location_id,
    c.status::text,
    l.operating_hours,
    l.organization_id
  into
    v_location_id,
    v_chair_status,
    v_location_operating_hours,
    v_location_organization_id
  from public.chairs c
  inner join public.locations l on l.id = c.location_id
  where c.id = new.chair_id;

  if v_location_id is null then
    raise exception 'Cadeira não encontrada.';
  end if;

  if new.organization_id <> v_location_organization_id then
    raise exception 'organization_id inválido para esta cadeira.';
  end if;

  if v_chair_status is null then
    raise exception 'Status da cadeira não encontrado.';
  end if;

  -- Ajuste simples e seguro:
  -- consideramos reservável apenas quando status = available
  if lower(v_chair_status) <> 'available' then
    raise exception 'Esta cadeira não está disponível para reserva.';
  end if;

  if not public.is_booking_within_location_hours(
    v_location_operating_hours,
    new.start_at,
    new.end_at
  ) then
    raise exception 'Reserva fora do horário de funcionamento da location.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_chair_booking on public.chair_bookings;

create trigger trg_validate_chair_booking
before insert or update on public.chair_bookings
for each row
execute function public.validate_chair_booking();

-- =========================================================
-- 11) RLS
-- =========================================================
alter table public.chair_bookings enable row level security;

-- Remove políticas antigas se existirem
drop policy if exists "chair_bookings_select_own_or_owner_org" on public.chair_bookings;
drop policy if exists "chair_bookings_insert_own_profile" on public.chair_bookings;
drop policy if exists "chair_bookings_update_own_pending_or_owner_org" on public.chair_bookings;
drop policy if exists "chair_bookings_delete_own_pending_or_owner_org" on public.chair_bookings;

-- SELECT:
-- - owner da organização da cadeira pode ver
-- - barbeiro dono do próprio booking pode ver
create policy "chair_bookings_select_own_or_owner_org"
on public.chair_bookings
for select
to authenticated
using (
  barber_profile_id = public.current_barber_profile_id()
  or exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
);

-- INSERT:
-- - somente o barbeiro logado pode inserir booking para ele mesmo
create policy "chair_bookings_insert_own_profile"
on public.chair_bookings
for insert
to authenticated
with check (
  barber_profile_id = public.current_barber_profile_id()
);

-- UPDATE:
-- - barbeiro só pode mexer nos próprios bookings
-- - owner pode mexer nos bookings da própria organização
create policy "chair_bookings_update_own_pending_or_owner_org"
on public.chair_bookings
for update
to authenticated
using (
  barber_profile_id = public.current_barber_profile_id()
  or exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
)
with check (
  barber_profile_id = public.current_barber_profile_id()
  or exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
);

-- DELETE:
-- - barbeiro pode deletar os próprios bookings
-- - owner pode deletar bookings da própria organização
create policy "chair_bookings_delete_own_pending_or_owner_org"
on public.chair_bookings
for delete
to authenticated
using (
  barber_profile_id = public.current_barber_profile_id()
  or exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
);

-- =========================================================
-- 12) VIEW PÚBLICA/SIMPLES PARA EXPLORE
--     Essa view NÃO mostra dados sensíveis do barbeiro que reservou.
--     Ela serve para a futura página /barber/explore.
--
--     is_available_now:
--       true  -> cadeira ativa e sem booking em andamento agora
--       false -> cadeira ocupada agora
-- =========================================================
drop view if exists public.vw_public_chair_explore;

create view public.vw_public_chair_explore as
select
  o.id as organization_id,
  o.name as organization_name,

  l.id as location_id,
  l.name as location_name,
  l.address,
  l.city,
  l.state,
  l.operating_hours,

  c.id as chair_id,
  c.identifier as chair_identifier,
  c.status as chair_status,

  not exists (
    select 1
    from public.chair_bookings cb
    where cb.chair_id = c.id
      and cb.status in ('pending', 'confirmed')
      and now() < cb.end_at
      and now() >= cb.start_at
  ) and lower(c.status::text) = 'available' as is_available_now
from public.organizations o
inner join public.locations l on l.organization_id = o.id
inner join public.chairs c on c.location_id = l.id;

-- =========================================================
-- 13) RLS/GRANTS DA VIEW
--     Em Postgres views usam permissões da view.
--     Aqui vamos permitir leitura para authenticated.
-- =========================================================
grant select on public.vw_public_chair_explore to authenticated;

commit;