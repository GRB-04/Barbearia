begin;

-- 1) Config da org: prazo do hold em minutos
alter table public.organizations
  add column if not exists waitlist_hold_minutes int not null default 60
  constraint organizations_waitlist_hold_minutes_check
  check (waitlist_hold_minutes between 5 and 1440);

-- 2) Enum de status da fila
do $$
begin
  if not exists (select 1 from pg_type where typname = 'waitlist_status') then
    create type public.waitlist_status as enum
      ('waiting', 'hold', 'converted', 'expired', 'cancelled');
  end if;
end
$$;

-- 3) Tabela
create table if not exists public.chair_waitlist (
  id uuid primary key default gen_random_uuid(),
  chair_id uuid not null references public.chairs(id) on delete cascade,
  barber_profile_id uuid not null references public.barber_profiles(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  desired_start_at timestamptz not null,
  desired_end_at timestamptz not null,
  status public.waitlist_status not null default 'waiting',
  hold_expires_at timestamptz,
  notified_at timestamptz,
  converted_booking_id uuid references public.chair_bookings(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint chair_waitlist_time_order_check check (desired_end_at > desired_start_at),
  constraint chair_waitlist_minimum_4_hours_check
    check (desired_end_at - desired_start_at >= interval '4 hours'),
  -- mesmo critério de "mesmo dia" usado em is_booking_within_location_hours
  constraint chair_waitlist_same_day_check
    check (desired_start_at::date = desired_end_at::date)
);

comment on table public.chair_waitlist is
  'Fila de espera por cadeira+período. Promoção/expiração via triggers e pg_cron.';

-- 1 entrada ativa por barbeiro+cadeira
create unique index if not exists uq_chair_waitlist_active_per_barber_chair
  on public.chair_waitlist (chair_id, barber_profile_id)
  where status in ('waiting', 'hold');

create index if not exists idx_chair_waitlist_chair_status
  on public.chair_waitlist (chair_id, status);
create index if not exists idx_chair_waitlist_barber
  on public.chair_waitlist (barber_profile_id);
create index if not exists idx_chair_waitlist_location
  on public.chair_waitlist (location_id);
create index if not exists idx_chair_waitlist_org
  on public.chair_waitlist (organization_id);
create index if not exists idx_chair_waitlist_hold_expiry
  on public.chair_waitlist (hold_expires_at) where status = 'hold';

-- 4) Validação + denormalização no INSERT.
-- location_id/organization_id vêm da cadeira (não confia no client).
create or replace function public.validate_chair_waitlist_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location_id uuid;
  v_organization_id uuid;
begin
  select c.location_id, l.organization_id
  into v_location_id, v_organization_id
  from public.chairs c
  join public.locations l on l.id = c.location_id
  where c.id = new.chair_id;

  if v_location_id is null then
    raise exception 'Cadeira não encontrada.';
  end if;

  new.location_id := v_location_id;
  new.organization_id := v_organization_id;

  if new.desired_start_at <= now() then
    raise exception 'O período desejado deve estar no futuro.';
  end if;

  -- fila só faz sentido se há conflito real; sem conflito, reserve direto
  if not exists (
    select 1
    from public.chair_bookings cb
    where cb.chair_id = new.chair_id
      and cb.status in ('pending', 'confirmed')
      and tstzrange(cb.start_at, cb.end_at, '[)')
          && tstzrange(new.desired_start_at, new.desired_end_at, '[)')
  ) then
    raise exception 'Não há conflito neste período — reserve a cadeira diretamente.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_chair_waitlist_insert on public.chair_waitlist;
create trigger trg_validate_chair_waitlist_insert
before insert on public.chair_waitlist
for each row execute function public.validate_chair_waitlist_insert();

-- 5) Posição na fila do barbeiro logado (definer: barbeiro não vê entradas alheias)
create or replace function public.my_waitlist_positions()
returns table (entry_id uuid, queue_position bigint)
language sql
stable
security definer
set search_path = public
as $$
  select w.id,
         1 + count(w2.id)
  from public.chair_waitlist w
  left join public.chair_waitlist w2
    on w2.chair_id = w.chair_id
   and w2.status = 'waiting'
   and w2.created_at < w.created_at
  where w.barber_profile_id = public.current_barber_profile_id()
    and w.status in ('waiting', 'hold')
  group by w.id;
$$;

grant execute on function public.my_waitlist_positions() to authenticated;

-- 6) RLS
alter table public.chair_waitlist enable row level security;

drop policy if exists "chair_waitlist_select" on public.chair_waitlist;
create policy "chair_waitlist_select"
on public.chair_waitlist for select to authenticated
using (
  barber_profile_id = public.current_barber_profile_id()
  or exists (
    select 1 from public.organizations o
    where o.id = chair_waitlist.organization_id and o.owner_id = auth.uid()
  )
  or location_id = public.managed_location_id()
);

-- INSERT: só o próprio barbeiro, só como 'waiting', sem hold forjado
drop policy if exists "chair_waitlist_insert_own" on public.chair_waitlist;
create policy "chair_waitlist_insert_own"
on public.chair_waitlist for insert to authenticated
with check (
  barber_profile_id = public.current_barber_profile_id()
  and status = 'waiting'
  and hold_expires_at is null
  and converted_booking_id is null
);

-- UPDATE: barbeiro só pode CANCELAR a própria entrada
-- (with check exige status final = 'cancelled'; impede forjar hold/prazo).
-- Triggers SECURITY DEFINER (promoção/expiração/conversão) bypassam RLS.
drop policy if exists "chair_waitlist_update_own_cancel" on public.chair_waitlist;
create policy "chair_waitlist_update_own_cancel"
on public.chair_waitlist for update to authenticated
using (barber_profile_id = public.current_barber_profile_id())
with check (
  barber_profile_id = public.current_barber_profile_id()
  and status = 'cancelled'
);

commit;
