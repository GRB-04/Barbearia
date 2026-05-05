-- Fix marketplace visibility for barbers
begin;

-- 1) Allow all authenticated users (barbers) to view organizations
-- This is necessary for the Explore page to list organizations
drop policy if exists "org_select" on public.organizations;
create policy "org_select_v2"
on public.organizations
for select
to authenticated
using (true); -- Any logged in user can see any organization (name, etc)

-- 2) Allow all authenticated users to view locations
drop policy if exists "locations_select_owner_only" on public.locations;
create policy "locations_select_marketplace"
on public.locations
for select
to authenticated
using (true); -- Any logged in user can see locations for exploring

-- 3) Allow all authenticated users to view chairs
drop policy if exists "chairs_select_owner_only" on public.chairs;
create policy "chairs_select_marketplace"
on public.chairs
for select
to authenticated
using (true); -- Any logged in user can see chairs for exploring

-- 4) Permissions (Grants)
grant select on public.organizations to authenticated;
grant select on public.locations to authenticated;
grant select on public.chairs to authenticated;

commit;
