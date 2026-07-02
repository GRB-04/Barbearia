-- Manager sees ALL barbers of their organization (not only those active at their location).
-- The client filters "active" (has booking/contract at the point) on top of the full roster.
--
-- Widens the manager barber_profiles visibility from location-scoped to org-scoped,
-- and lets the manager read the org roster (organization_barbers). Both go through
-- SECURITY DEFINER helpers so the policy evaluation never re-enters an RLS-protected
-- table (avoids the 42P17 recursion class).
begin;

-- Helper: the manager's organization id (RLS-bypassing)
create or replace function public.managed_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ob.organization_id
  from public.organization_barbers ob
  where ob.user_id = auth.uid()
    and ob.role = 'manager'
    and ob.organization_id is not null
  limit 1;
$$;

grant execute on function public.managed_organization_id() to authenticated;

-- Helper: barber_profile ids of every roster member in the manager's org
create or replace function public.managed_organization_barber_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ob.barber_profile_id
  from public.organization_barbers ob
  where ob.organization_id = public.managed_organization_id()
    and ob.barber_profile_id is not null;
$$;

grant execute on function public.managed_organization_barber_profile_ids() to authenticated;

-- barber_profiles: manager sees all profiles in their org (replaces the location-scoped policy)
drop policy if exists "manager_select_location_barber_profiles" on public.barber_profiles;
drop policy if exists "manager_select_org_barber_profiles" on public.barber_profiles;
create policy "manager_select_org_barber_profiles"
  on public.barber_profiles for select to authenticated
  using (id in (select public.managed_organization_barber_profile_ids()));

-- organization_barbers: manager sees the org roster (needed to list barbers + their active state)
drop policy if exists "manager_select_org_barbers" on public.organization_barbers;
create policy "manager_select_org_barbers"
  on public.organization_barbers for select to authenticated
  using (organization_id = public.managed_organization_id());

commit;
