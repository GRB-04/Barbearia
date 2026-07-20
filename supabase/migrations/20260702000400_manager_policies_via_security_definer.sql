-- Break RLS recursion caused by manager policies subquerying RLS-protected tables.
--
-- Root cause: the manager location-scoping policies subqueried chairs / chair_bookings
-- directly. Because those tables carry their own policies that reach back to
-- organizations and barber_profiles (e.g. chair_bookings_select_own_or_owner_org does
-- EXISTS(select from organizations ...), and organizations_select_simple subqueries
-- barber_profiles), the manager barber_profiles policy closed a 3-table cycle:
--   organizations -> barber_profiles -> chair_bookings -> organizations  (42P17)
--
-- Fix: route every manager location subquery through SECURITY DEFINER set-returning
-- helpers. Their internal reads bypass RLS, so evaluating a manager policy never
-- re-enters another table's policy. This matches how managed_location_id() and the
-- other access helpers already avoid recursion.
--
-- Safe: each helper is scoped to managed_location_id(), which is itself scoped to
-- auth.uid(); a non-manager gets an empty set.
begin;

-- ============================================================
-- SECURITY DEFINER set-returning helpers (RLS-bypassing, location-scoped)
-- ============================================================
create or replace function public.managed_location_chair_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.id
  from public.chairs c
  where c.location_id = public.managed_location_id();
$$;

grant execute on function public.managed_location_chair_ids() to authenticated;

create or replace function public.managed_location_booking_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select cb.id
  from public.chair_bookings cb
  join public.chairs c on c.id = cb.chair_id
  where c.location_id = public.managed_location_id();
$$;

grant execute on function public.managed_location_booking_ids() to authenticated;

create or replace function public.managed_location_barber_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select distinct cb.barber_profile_id
  from public.chair_bookings cb
  join public.chairs c on c.id = cb.chair_id
  where c.location_id = public.managed_location_id()
    and cb.barber_profile_id is not null;
$$;

grant execute on function public.managed_location_barber_profile_ids() to authenticated;

-- ============================================================
-- Recreate manager policies to use the helpers (no direct table subqueries)
-- ============================================================

-- chair_bookings
drop policy if exists "manager_select_location_bookings" on public.chair_bookings;
create policy "manager_select_location_bookings"
  on public.chair_bookings for select to authenticated
  using (chair_id in (select public.managed_location_chair_ids()));

drop policy if exists "manager_update_location_bookings" on public.chair_bookings;
create policy "manager_update_location_bookings"
  on public.chair_bookings for update to authenticated
  using (chair_id in (select public.managed_location_chair_ids()))
  with check (chair_id in (select public.managed_location_chair_ids()));

-- contracts
drop policy if exists "manager_select_location_contracts" on public.contracts;
create policy "manager_select_location_contracts"
  on public.contracts for select to authenticated
  using (chair_id in (select public.managed_location_chair_ids()));

-- barber_profiles  (this was the policy that closed the recursion cycle)
drop policy if exists "manager_select_location_barber_profiles" on public.barber_profiles;
create policy "manager_select_location_barber_profiles"
  on public.barber_profiles for select to authenticated
  using (id in (select public.managed_location_barber_profile_ids()));

-- payments
drop policy if exists "manager_select_location_payments" on public.payments;
create policy "manager_select_location_payments"
  on public.payments for select to authenticated
  using (
    (
      public.manager_has_permission('can_manage_payments')
      or public.manager_has_permission('can_view_financials')
    )
    and booking_id in (select public.managed_location_booking_ids())
  );

drop policy if exists "manager_update_location_payments" on public.payments;
create policy "manager_update_location_payments"
  on public.payments for update to authenticated
  using (
    public.manager_has_permission('can_manage_payments')
    and booking_id in (select public.managed_location_booking_ids())
  )
  with check (
    public.manager_has_permission('can_manage_payments')
    and booking_id in (select public.managed_location_booking_ids())
  );

commit;
