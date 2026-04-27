begin;

alter table public.locations enable row level security;

drop policy if exists "locations_select_owner_only" on public.locations;
drop policy if exists "locations_insert_owner_only" on public.locations;
drop policy if exists "locations_update_owner_only" on public.locations;
drop policy if exists "locations_delete_owner_only" on public.locations;
drop policy if exists "locations_select_owner_or_barber_same_org" on public.locations;
drop policy if exists "Authenticated users can browse locations" on public.locations;
drop policy if exists "Owner can view locations" on public.locations;
drop policy if exists "Owner can insert locations" on public.locations;
drop policy if exists "Owner can update locations" on public.locations;
drop policy if exists "Owner can delete locations" on public.locations;

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

commit;