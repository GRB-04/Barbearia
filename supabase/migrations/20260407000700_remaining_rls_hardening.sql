begin;

-- =========================================================
-- BARBER CHAIR CONNECT
-- HARDENING RLS RESTANTE (F002)
-- Sem recursão em policies
-- =========================================================

-- ---------------------------------------------------------
-- 0) Garantias mínimas
-- ---------------------------------------------------------

alter table public.locations enable row level security;
alter table public.chairs enable row level security;
alter table public.barbers enable row level security;
alter table public.contracts enable row level security;
alter table public.payments enable row level security;
alter table public.chair_bookings enable row level security;
alter table public.barber_profiles enable row level security;

-- Se ainda não existir, garante vínculo técnico entre barber interno e login
alter table public.barbers
add column if not exists barber_profile_id uuid references public.barber_profiles(id) on delete set null;

create index if not exists idx_locations_organization_id
  on public.locations (organization_id);

create index if not exists idx_chairs_location_id
  on public.chairs (location_id);

create index if not exists idx_barbers_organization_id
  on public.barbers (organization_id);

create index if not exists idx_barbers_barber_profile_id
  on public.barbers (barber_profile_id);

create index if not exists idx_contracts_organization_id
  on public.contracts (organization_id);

create index if not exists idx_payments_organization_id
  on public.payments (organization_id);

create index if not exists idx_chair_bookings_organization_id
  on public.chair_bookings (organization_id);

create index if not exists idx_chair_bookings_barber_profile_id
  on public.chair_bookings (barber_profile_id);

-- Backfill do vínculo por email, sem sobrescrever manualmente algo já ligado
update public.barbers b
set barber_profile_id = bp.id
from public.barber_profiles bp
where b.barber_profile_id is null
  and b.email is not null
  and bp.email is not null
  and lower(trim(b.email)) = lower(trim(bp.email));

-- ---------------------------------------------------------
-- 1) Função simples para pegar o barber_profile atual
-- ---------------------------------------------------------

create or replace function public.current_barber_profile_id()
returns uuid
language sql
stable
as $$
  select bp.id
  from public.barber_profiles bp
  where bp.user_id = auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------
-- 2) Remover policies antigas/permissivas
-- ---------------------------------------------------------

-- LOCATIONS
drop policy if exists "Authenticated users can browse locations" on public.locations;
drop policy if exists "Owner can view locations" on public.locations;
drop policy if exists "Owner can insert locations" on public.locations;
drop policy if exists "Owner can update locations" on public.locations;
drop policy if exists "Owner can delete locations" on public.locations;
drop policy if exists "Users can view accessible locations" on public.locations;

-- CHAIRS
drop policy if exists "Authenticated users can browse chairs" on public.chairs;
drop policy if exists "Owner can view chairs" on public.chairs;
drop policy if exists "Owner can insert chairs" on public.chairs;
drop policy if exists "Owner can update chairs" on public.chairs;
drop policy if exists "Owner can delete chairs" on public.chairs;
drop policy if exists "Users can view accessible chairs" on public.chairs;

-- BARBERS
drop policy if exists "Owner can view barbers" on public.barbers;
drop policy if exists "Owner can insert barbers" on public.barbers;
drop policy if exists "Owner can update barbers" on public.barbers;
drop policy if exists "Owner can delete barbers" on public.barbers;
drop policy if exists "Users can view accessible barbers" on public.barbers;

-- CONTRACTS
drop policy if exists "Owner can view contracts" on public.contracts;
drop policy if exists "Owner can insert contracts" on public.contracts;
drop policy if exists "Owner can update contracts" on public.contracts;
drop policy if exists "Owner can delete contracts" on public.contracts;
drop policy if exists "Users can view accessible contracts" on public.contracts;

-- PAYMENTS
drop policy if exists "Owner can view payments" on public.payments;
drop policy if exists "Owner can insert payments" on public.payments;
drop policy if exists "Owner can update payments" on public.payments;
drop policy if exists "Users can view accessible payments" on public.payments;

-- CHAIR BOOKINGS
drop policy if exists "Barbers can view own bookings" on public.chair_bookings;
drop policy if exists "Barbers can insert own bookings" on public.chair_bookings;
drop policy if exists "Barbers can update own bookings" on public.chair_bookings;
drop policy if exists "Owners can view chair bookings" on public.chair_bookings;
drop policy if exists "Users can view accessible chair bookings" on public.chair_bookings;
drop policy if exists "Barbers can insert own bookings safely" on public.chair_bookings;
drop policy if exists "Barbers can update own bookings safely" on public.chair_bookings;
drop policy if exists "Owners can insert chair bookings" on public.chair_bookings;
drop policy if exists "Owners can update chair bookings" on public.chair_bookings;
drop policy if exists "Owners can delete chair bookings" on public.chair_bookings;

-- BARBER PROFILES
drop policy if exists "Barbers can view own profile" on public.barber_profiles;
drop policy if exists "Barbers can update own profile" on public.barber_profiles;
drop policy if exists "Barbers can insert own profile" on public.barber_profiles;

-- ---------------------------------------------------------
-- 3) BARBER PROFILES: self only
-- ---------------------------------------------------------

create policy "barber_profiles_select_self"
on public.barber_profiles
for select
to authenticated
using (user_id = auth.uid());

create policy "barber_profiles_insert_self"
on public.barber_profiles
for insert
to authenticated
with check (user_id = auth.uid());

create policy "barber_profiles_update_self"
on public.barber_profiles
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- ---------------------------------------------------------
-- 4) LOCATIONS
-- Owner vê locations da própria organização
-- Barber vê locations da organização em que está vinculado via barbers.barber_profile_id
-- ---------------------------------------------------------

create policy "locations_select_secure"
on public.locations
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = locations.organization_id
      and o.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.barbers b
    where b.organization_id = locations.organization_id
      and b.barber_profile_id = public.current_barber_profile_id()
  )
);

create policy "locations_insert_owner_only"
on public.locations
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = locations.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "locations_update_owner_only"
on public.locations
for update
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = locations.organization_id
      and o.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = locations.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "locations_delete_owner_only"
on public.locations
for delete
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = locations.organization_id
      and o.owner_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 5) CHAIRS
-- ---------------------------------------------------------

create policy "chairs_select_secure"
on public.chairs
for select
to authenticated
using (
  exists (
    select 1
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where l.id = chairs.location_id
      and o.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.locations l
    join public.barbers b on b.organization_id = l.organization_id
    where l.id = chairs.location_id
      and b.barber_profile_id = public.current_barber_profile_id()
  )
);

create policy "chairs_insert_owner_only"
on public.chairs
for insert
to authenticated
with check (
  exists (
    select 1
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where l.id = chairs.location_id
      and o.owner_id = auth.uid()
  )
);

create policy "chairs_update_owner_only"
on public.chairs
for update
to authenticated
using (
  exists (
    select 1
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where l.id = chairs.location_id
      and o.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where l.id = chairs.location_id
      and o.owner_id = auth.uid()
  )
);

create policy "chairs_delete_owner_only"
on public.chairs
for delete
to authenticated
using (
  exists (
    select 1
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where l.id = chairs.location_id
      and o.owner_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 6) BARBERS
-- Owner vê/gerencia barbers da própria org
-- Barber vê apenas o próprio registro vinculado
-- ---------------------------------------------------------

create policy "barbers_select_secure"
on public.barbers
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = barbers.organization_id
      and o.owner_id = auth.uid()
  )
  or barbers.barber_profile_id = public.current_barber_profile_id()
);

create policy "barbers_insert_owner_only"
on public.barbers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = barbers.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "barbers_update_owner_only"
on public.barbers
for update
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = barbers.organization_id
      and o.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = barbers.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "barbers_delete_owner_only"
on public.barbers
for delete
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = barbers.organization_id
      and o.owner_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 7) CONTRACTS
-- ---------------------------------------------------------

create policy "contracts_select_secure"
on public.contracts
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = contracts.organization_id
      and o.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.barbers b
    where b.organization_id = contracts.organization_id
      and b.barber_profile_id = public.current_barber_profile_id()
  )
);

create policy "contracts_insert_owner_only"
on public.contracts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = contracts.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "contracts_update_owner_only"
on public.contracts
for update
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = contracts.organization_id
      and o.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = contracts.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "contracts_delete_owner_only"
on public.contracts
for delete
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = contracts.organization_id
      and o.owner_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 8) PAYMENTS
-- ---------------------------------------------------------

create policy "payments_select_secure"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = payments.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "payments_insert_owner_only"
on public.payments
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = payments.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "payments_update_owner_only"
on public.payments
for update
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = payments.organization_id
      and o.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = payments.organization_id
      and o.owner_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 9) CHAIR BOOKINGS
-- Owner vê bookings da própria org
-- Barber vê/insere/atualiza apenas os próprios bookings
-- ---------------------------------------------------------

create policy "chair_bookings_select_secure"
on public.chair_bookings
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
  or chair_bookings.barber_profile_id = public.current_barber_profile_id()
);

create policy "chair_bookings_insert_barber_self"
on public.chair_bookings
for insert
to authenticated
with check (
  chair_bookings.barber_profile_id = public.current_barber_profile_id()
);

create policy "chair_bookings_update_barber_self"
on public.chair_bookings
for update
to authenticated
using (
  chair_bookings.barber_profile_id = public.current_barber_profile_id()
)
with check (
  chair_bookings.barber_profile_id = public.current_barber_profile_id()
);

create policy "chair_bookings_insert_owner_only"
on public.chair_bookings
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "chair_bookings_update_owner_only"
on public.chair_bookings
for update
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
);

create policy "chair_bookings_delete_owner_only"
on public.chair_bookings
for delete
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = chair_bookings.organization_id
      and o.owner_id = auth.uid()
  )
);

commit;