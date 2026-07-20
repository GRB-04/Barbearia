-- Fix infinite recursion on organizations (SQLSTATE 42P17)
--
-- Root cause: user_has_access_to_organization / _location / _chair were created
-- as `language sql stable` WITHOUT `security definer`. An active RLS policy on
-- organizations calls user_has_access_to_organization(), whose internal
-- `select from organizations ...` re-triggers that same policy → infinite recursion.
--
-- Every other access helper in this schema (current_barber_profile_id,
-- managed_location_id, manager_has_permission, is_location_manager) is already
-- SECURITY DEFINER for exactly this reason: the internal reads bypass RLS and
-- terminate the recursion. These three were the outliers. Recreating them as
-- SECURITY DEFINER (with a fixed search_path) closes the loop.
--
-- Safe: each function only returns a boolean about the CURRENT user's access,
-- scoped internally by auth.uid() / current_barber_profile_id(). No data leaks.
begin;

create or replace function public.user_has_access_to_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.organization_barbers b
    where b.organization_id = p_organization_id
      and b.barber_profile_id = public.current_barber_profile_id()
  );
$$;

create or replace function public.user_has_access_to_location(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and public.user_has_access_to_organization(l.organization_id)
  );
$$;

create or replace function public.user_has_access_to_chair(p_chair_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chairs c
    join public.locations l on l.id = c.location_id
    where c.id = p_chair_id
      and public.user_has_access_to_organization(l.organization_id)
  );
$$;

commit;
