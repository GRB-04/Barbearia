begin;

-- =========================================================
-- F002 + F003
-- Permitir que o barbeiro veja apenas locations/chairs
-- da organization à qual ele pertence
-- sem recursão
-- =========================================================

alter table public.locations enable row level security;
alter table public.chairs enable row level security;

-- ---------------------------------------------------------
-- LIMPA policies antigas de locations
-- ---------------------------------------------------------
drop policy if exists "locations_select_owner_only" on public.locations;
drop policy if exists "locations_insert_owner_only" on public.locations;
drop policy if exists "locations_update_owner_only" on public.locations;
drop policy if exists "locations_delete_owner_only" on public.locations;
drop policy if exists "Authenticated users can browse locations" on public.locations;
drop policy if exists "Owner can view locations" on public.locations;
drop policy if exists "Owner can insert locations" on public.locations;
drop policy if exists "Owner can update locations" on public.locations;
drop policy if exists "Owner can delete locations" on public.locations;
drop policy if exists "locations_select_secure" on public.locations;

-- ---------------------------------------------------------
-- LOCATIONS
-- owner vê as suas
-- barbeiro vê só as da organization_id do próprio barber_profile
-- ---------------------------------------------------------
create policy "locations_select_owner_or_barber_same_org"
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
  or locations.organization_id in (
    select bp.organization_id
    from public.barber_profiles bp
    where bp.user_id = auth.uid()
      and bp.organization_id is not null
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
-- LIMPA policies antigas de chairs
-- ---------------------------------------------------------
drop policy if exists "chairs_select_simple_owner" on public.chairs;
drop policy if exists "chairs_insert_simple_owner" on public.chairs;
drop policy if exists "chairs_update_simple_owner" on public.chairs;
drop policy if exists "chairs_delete_simple_owner" on public.chairs;
drop policy if exists "chairs_select_owner_only" on public.chairs;
drop policy if exists "chairs_insert_owner_only" on public.chairs;
drop policy if exists "chairs_update_owner_only" on public.chairs;
drop policy if exists "chairs_delete_owner_only" on public.chairs;
drop policy if exists "Authenticated users can browse chairs" on public.chairs;
drop policy if exists "Owner can view chairs" on public.chairs;
drop policy if exists "Owner can insert chairs" on public.chairs;
drop policy if exists "Owner can update chairs" on public.chairs;
drop policy if exists "Owner can delete chairs" on public.chairs;

-- ---------------------------------------------------------
-- CHAIRS
-- owner vê as suas
-- barbeiro vê só chairs das locations da org dele
-- ---------------------------------------------------------
create policy "chairs_select_owner_or_barber_same_org"
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
    where l.id = chairs.location_id
      and l.organization_id in (
        select bp.organization_id
        from public.barber_profiles bp
        where bp.user_id = auth.uid()
          and bp.organization_id is not null
      )
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

commit;