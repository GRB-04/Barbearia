begin;

-- =========================================================
-- BARBER CHAIR CONNECT
-- RESET DE RLS RECURSIVO E ESTABILIZAÇÃO DO OWNER
-- =========================================================
-- Objetivo:
-- 1. remover funções/policies que podem estar gerando recursão
-- 2. deixar o fluxo do owner estável e sem stack depth
-- 3. manter barber_profiles separado sem causar loop
-- =========================================================

-- ---------------------------------------------------------
-- 0) Remover triggers que possam gerar loop
-- ---------------------------------------------------------
drop trigger if exists trg_sync_barber_profile_link_from_barbers on public.barbers;
drop trigger if exists trg_sync_barber_profile_link_from_profiles on public.barber_profiles;

drop function if exists public.sync_barber_profile_link();

-- ---------------------------------------------------------
-- 1) Remover funções auxiliares potencialmente recursivas
-- ---------------------------------------------------------
drop function if exists public.user_has_access_to_chair(uuid);
drop function if exists public.user_has_access_to_location(uuid);
drop function if exists public.user_has_access_to_organization(uuid);
drop function if exists public.get_chair_organization_id(uuid);

-- Mantemos só a função simples do barber profile atual
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
-- 2) Garantir RLS ligado
-- ---------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.locations enable row level security;
alter table public.chairs enable row level security;
alter table public.barbers enable row level security;
alter table public.contracts enable row level security;
alter table public.payments enable row level security;
alter table public.chair_bookings enable row level security;
alter table public.barber_profiles enable row level security;

-- ---------------------------------------------------------
-- 3) Limpar TODAS as policies conhecidas
-- ---------------------------------------------------------

-- ORGANIZATIONS
drop policy if exists "Users can view accessible organizations" on public.organizations;
drop policy if exists "Owner can view own organizations" on public.organizations;
drop policy if exists "Authenticated users can browse organizations" on public.organizations;
drop policy if exists "Owner can insert organizations" on public.organizations;
drop policy if exists "Owner can update own organizations" on public.organizations;
drop policy if exists "Owner can delete own organizations" on public.organizations;
drop policy if exists "org_select" on public.organizations;
drop policy if exists "org_insert" on public.organizations;
drop policy if exists "org_update" on public.organizations;
drop policy if exists "org_delete" on public.organizations;

-- LOCATIONS
drop policy if exists "Authenticated users can browse locations" on public.locations;
drop policy if exists "Owner can view locations" on public.locations;
drop policy if exists "Owner can insert locations" on public.locations;
drop policy if exists "Owner can update locations" on public.locations;
drop policy if exists "Owner can delete locations" on public.locations;
drop policy if exists "Users can view accessible locations" on public.locations;
drop policy if exists "locations_select_secure" on public.locations;
drop policy if exists "locations_insert_owner_only" on public.locations;
drop policy if exists "locations_update_owner_only" on public.locations;
drop policy if exists "locations_delete_owner_only" on public.locations;

-- CHAIRS
drop policy if exists "Authenticated users can browse chairs" on public.chairs;
drop policy if exists "Owner can view chairs" on public.chairs;
drop policy if exists "Owner can insert chairs" on public.chairs;
drop policy if exists "Owner can update chairs" on public.chairs;
drop policy if exists "Owner can delete chairs" on public.chairs;
drop policy if exists "Users can view accessible chairs" on public.chairs;
drop policy if exists "chairs_select_secure" on public.chairs;
drop policy if exists "chairs_insert_owner_only" on public.chairs;
drop policy if exists "chairs_update_owner_only" on public.chairs;
drop policy if exists "chairs_delete_owner_only" on public.chairs;

-- BARBERS
drop policy if exists "Owner can view barbers" on public.barbers;
drop policy if exists "Owner can insert barbers" on public.barbers;
drop policy if exists "Owner can update barbers" on public.barbers;
drop policy if exists "Owner can delete barbers" on public.barbers;
drop policy if exists "Users can view accessible barbers" on public.barbers;
drop policy if exists "barbers_select_secure" on public.barbers;
drop policy if exists "barbers_insert_owner_only" on public.barbers;
drop policy if exists "barbers_update_owner_only" on public.barbers;
drop policy if exists "barbers_delete_owner_only" on public.barbers;

-- CONTRACTS
drop policy if exists "Owner can view contracts" on public.contracts;
drop policy if exists "Owner can insert contracts" on public.contracts;
drop policy if exists "Owner can update contracts" on public.contracts;
drop policy if exists "Owner can delete contracts" on public.contracts;
drop policy if exists "Users can view accessible contracts" on public.contracts;
drop policy if exists "contracts_select_secure" on public.contracts;
drop policy if exists "contracts_insert_owner_only" on public.contracts;
drop policy if exists "contracts_update_owner_only" on public.contracts;
drop policy if exists "contracts_delete_owner_only" on public.contracts;

-- PAYMENTS
drop policy if exists "Owner can view payments" on public.payments;
drop policy if exists "Owner can insert payments" on public.payments;
drop policy if exists "Owner can update payments" on public.payments;
drop policy if exists "Users can view accessible payments" on public.payments;
drop policy if exists "payments_select_secure" on public.payments;
drop policy if exists "payments_insert_owner_only" on public.payments;
drop policy if exists "payments_update_owner_only" on public.payments;

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
drop policy if exists "chair_bookings_select_secure" on public.chair_bookings;
drop policy if exists "chair_bookings_insert_barber_self" on public.chair_bookings;
drop policy if exists "chair_bookings_update_barber_self" on public.chair_bookings;
drop policy if exists "chair_bookings_insert_owner_only" on public.chair_bookings;
drop policy if exists "chair_bookings_update_owner_only" on public.chair_bookings;
drop policy if exists "chair_bookings_delete_owner_only" on public.chair_bookings;

-- BARBER PROFILES
drop policy if exists "Barbers can view own profile" on public.barber_profiles;
drop policy if exists "Barbers can update own profile" on public.barber_profiles;
drop policy if exists "Barbers can insert own profile" on public.barber_profiles;
drop policy if exists "barber_profiles_select_self" on public.barber_profiles;
drop policy if exists "barber_profiles_insert_self" on public.barber_profiles;
drop policy if exists "barber_profiles_update_self" on public.barber_profiles;

-- ---------------------------------------------------------
-- 4) Recriar policies simples e sem recursão
-- ---------------------------------------------------------

-- ORGANIZATIONS
create policy "org_select"
on public.organizations
for select
to authenticated
using (owner_id = auth.uid());

create policy "org_insert"
on public.organizations
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "org_update"
on public.organizations
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "org_delete"
on public.organizations
for delete
to authenticated
using (owner_id = auth.uid());

-- LOCATIONS (OWNER ONLY, por enquanto)
create policy "locations_select_owner_only"
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

-- CHAIRS (OWNER ONLY, por enquanto)
create policy "chairs_select_owner_only"
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

-- BARBERS (OWNER vê todos da sua org; BARBEIRO vê só o próprio)
create policy "barbers_select_safe"
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

-- BARBER PROFILES (SELF ONLY)
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

-- CONTRACTS (OWNER ONLY, por enquanto)
create policy "contracts_select_owner_only"
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

-- PAYMENTS (OWNER ONLY)
create policy "payments_select_owner_only"
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

-- CHAIR BOOKINGS
-- Owner vê bookings da própria org
-- Barber vê e altera apenas os próprios
create policy "chair_bookings_select_safe"
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