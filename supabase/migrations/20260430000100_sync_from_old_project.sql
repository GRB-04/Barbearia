begin;

-- ============================================================
-- SYNC FROM OLD PROJECT (qrfggirhrunuaecvltub)
-- Adaptado para o projeto atual (barber-chair-connect-63)
-- Data: 2026-04-30
-- ============================================================


-- ============================================================
-- 1) ENUM: app_role (para barbers e barber_profiles)
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'app_role'
  ) then
    create type public.app_role as enum ('owner', 'barber', 'admin');
  end if;
end
$$;


-- ============================================================
-- 2) COLUNAS FALTANDO EM TABELAS EXISTENTES
-- ============================================================

-- barbers: adicionar role se não existir
alter table public.barbers
  add column if not exists role public.app_role default 'barber';

-- barber_profiles: adicionar role se não existir
alter table public.barber_profiles
  add column if not exists role public.app_role default 'barber';

-- contracts: colunas start_at / end_at (timestamptz) vindas do projeto antigo
-- O projeto atual usa start_date/end_date (date). Adicionamos start_at/end_at
-- como aliases computados para compatibilidade com código mais antigo.
alter table public.contracts
  add column if not exists start_at timestamptz;

alter table public.contracts
  add column if not exists end_at timestamptz;

-- Backfill: popular start_at/end_at a partir de start_date/end_date existentes
update public.contracts
set
  start_at = coalesce(start_at, start_date::timestamptz),
  end_at   = coalesce(end_at,   coalesce(end_date::timestamptz, (start_date + interval '1 year')::timestamptz))
where start_at is null;


-- ============================================================
-- 3) TABELA: barber_clients
--    Registro de clientes atendidos por cada barbeiro
-- ============================================================
create table if not exists public.barber_clients (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  barber_profile_id      uuid not null references public.barber_profiles(id) on delete cascade,
  full_name              text not null,
  phone                  text,
  email                  text,
  first_appointment_date date,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.barber_clients is 'Clientes cadastrados por cada barbeiro dentro de uma organização.';

-- Índices
create index if not exists idx_barber_clients_barber_profile_id
  on public.barber_clients (barber_profile_id);

create index if not exists idx_barber_clients_organization_id
  on public.barber_clients (organization_id);

-- RLS
alter table public.barber_clients enable row level security;

drop policy if exists "barber_clients_select_own" on public.barber_clients;
create policy "barber_clients_select_own"
on public.barber_clients for select
to authenticated
using (
  barber_profile_id in (
    select bp.id from public.barber_profiles bp where bp.user_id = auth.uid()
  )
);

drop policy if exists "barber_clients_insert_own" on public.barber_clients;
create policy "barber_clients_insert_own"
on public.barber_clients for insert
to authenticated
with check (
  barber_profile_id in (
    select bp.id from public.barber_profiles bp where bp.user_id = auth.uid()
  )
);

drop policy if exists "barber_clients_update_own" on public.barber_clients;
create policy "barber_clients_update_own"
on public.barber_clients for update
to authenticated
using (
  barber_profile_id in (
    select bp.id from public.barber_profiles bp where bp.user_id = auth.uid()
  )
)
with check (
  barber_profile_id in (
    select bp.id from public.barber_profiles bp where bp.user_id = auth.uid()
  )
);

drop policy if exists "barber_clients_delete_own" on public.barber_clients;
create policy "barber_clients_delete_own"
on public.barber_clients for delete
to authenticated
using (
  barber_profile_id in (
    select bp.id from public.barber_profiles bp where bp.user_id = auth.uid()
  )
);

-- Owner também pode ver clientes da organização
drop policy if exists "barber_clients_select_org_owner" on public.barber_clients;
create policy "barber_clients_select_org_owner"
on public.barber_clients for select
to authenticated
using (
  organization_id in (
    select id from public.organizations where owner_id = auth.uid()
  )
);


-- ============================================================
-- 4) TRIGGER: updated_at em barber_clients
-- ============================================================
drop trigger if exists trg_barber_clients_set_updated_at on public.barber_clients;

create trigger trg_barber_clients_set_updated_at
before update on public.barber_clients
for each row
execute function public.set_current_timestamp_updated_at();


-- ============================================================
-- 5) FUNÇÃO: check_location_capacity_before_chair_insert
--    Impede criar mais cadeiras do que a capacidade da location
-- ============================================================
create or replace function public.check_location_capacity_before_chair_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_current_count integer;
begin
  select l.capacity
    into v_capacity
  from public.locations l
  where l.id = new.location_id;

  if v_capacity is null or v_capacity = 0 then
    -- Sem limite definido, permite
    return new;
  end if;

  select count(*)
    into v_current_count
  from public.chairs c
  where c.location_id = new.location_id;

  if v_current_count >= v_capacity then
    raise exception 'Limite de cadeiras atingido para esta location. Capacidade máxima: %.', v_capacity;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_location_capacity on public.chairs;

create trigger trg_check_location_capacity
before insert on public.chairs
for each row
execute function public.check_location_capacity_before_chair_insert();


-- ============================================================
-- 6) FUNÇÃO: bind_barber_profile_to_org (versão com role)
--    Atualizada para propagar o role do barber para o perfil
-- ============================================================
create or replace function public.bind_barber_profile_to_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barber_id uuid;
  v_org_id    uuid;
  v_role      public.app_role;
begin
  if new.email is null then
    return new;
  end if;

  select b.id, b.organization_id, b.role
    into v_barber_id, v_org_id, v_role
  from public.barbers b
  where b.email is not null
    and lower(trim(b.email)) = lower(trim(new.email))
  order by b.created_at asc
  limit 1;

  if v_org_id is not null then
    new.organization_id := v_org_id;
    new.role := coalesce(v_role, 'barber');
  end if;

  if v_barber_id is not null then
    update public.barbers
    set barber_profile_id = new.id
    where id = v_barber_id
      and (barber_profile_id is distinct from new.id);
  end if;

  return new;
end;
$$;

-- Garantir que o trigger existe (pode ter sido criado por migration anterior)
drop trigger if exists trg_bind_barber_profile_to_org on public.barber_profiles;

create trigger trg_bind_barber_profile_to_org
before insert on public.barber_profiles
for each row
execute function public.bind_barber_profile_to_org();


-- ============================================================
-- 7) VIEW: vw_barber_bookings
--    Visão consolidada de reservas com dados de pagamento
-- ============================================================
drop view if exists public.vw_barber_bookings;

create view public.vw_barber_bookings as
select
  cb.id,
  cb.barber_profile_id,
  cb.organization_id,
  cb.chair_id,
  cb.start_at,
  cb.end_at,
  cb.status                    as booking_status,
  cb.notes,
  cb.created_at,

  c.identifier                 as chair_identifier,

  l.name                       as location_name,
  l.address                    as location_address,
  l.city                       as location_city,
  l.state                      as location_state,

  o.name                       as organization_name,

  p.status                     as payment_status,
  p.id                         as payment_id,
  p.amount                     as payment_amount

from public.chair_bookings cb
inner join public.chairs c          on c.id = cb.chair_id
inner join public.locations l       on l.id = c.location_id
inner join public.organizations o   on o.id = cb.organization_id
left  join public.payments p        on p.booking_id = cb.id;

grant select on public.vw_barber_bookings to authenticated;


-- ============================================================
-- 8) VIEW: vw_location_occupancy
--    Ocupação atual por location (cadeiras vs bookings ativos)
-- ============================================================
drop view if exists public.vw_location_occupancy;

create view public.vw_location_occupancy as
select
  l.id              as location_id,
  l.organization_id,
  l.name            as location_name,
  count(c.id)       as total_chairs,
  count(cb.id)      as occupied_chairs
from public.locations l
left join public.chairs c on c.location_id = l.id
left join public.chair_bookings cb
  on cb.chair_id = c.id
  and cb.status in ('pending', 'confirmed')
  and now() >= cb.start_at
  and now() < cb.end_at
group by l.id, l.organization_id, l.name;

grant select on public.vw_location_occupancy to authenticated;


-- ============================================================
-- 9) RLS ADICIONAL: barbers podem inserir/atualizar os próprios
--    pagamentos via booking (vindo do projeto antigo)
-- ============================================================
drop policy if exists "barbers_insert_own_payments" on public.payments;
create policy "barbers_insert_own_payments"
on public.payments for insert
to authenticated
with check (
  exists (
    select 1 from public.chair_bookings cb
    where cb.id = payments.booking_id
      and cb.barber_profile_id = public.current_barber_profile_id()
  )
);

drop policy if exists "barbers_update_own_payments" on public.payments;
create policy "barbers_update_own_payments"
on public.payments for update
to authenticated
using (
  exists (
    select 1 from public.chair_bookings cb
    where cb.id = payments.booking_id
      and cb.barber_profile_id = public.current_barber_profile_id()
  )
)
with check (
  exists (
    select 1 from public.chair_bookings cb
    where cb.id = payments.booking_id
      and cb.barber_profile_id = public.current_barber_profile_id()
  )
);


-- ============================================================
-- 10) RLS ADICIONAL: check_ins — barbeiro pode ver da mesma org
-- ============================================================
drop policy if exists "chair_bookings_select_same_org" on public.chair_bookings;
create policy "chair_bookings_select_same_org"
on public.chair_bookings for select
to authenticated
using (
  organization_id in (
    select bp.organization_id
    from public.barber_profiles bp
    where bp.user_id = auth.uid()
      and bp.organization_id is not null
  )
);

commit;
