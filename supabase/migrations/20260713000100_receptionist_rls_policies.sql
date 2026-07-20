-- Migration: receptionist RLS policies and helpers
begin;

-- 1) Helper: receptionist's organization id (security definer to prevent RLS recursion)
create or replace function public.receptionist_organization_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ob.organization_id
  from public.organization_barbers ob
  where ob.user_id = auth.uid()
    and ob.role = 'receptionist'
    and ob.organization_id is not null
  limit 1;
$$;

grant execute on function public.receptionist_organization_id() to authenticated;

-- 2) Helper: barber_profile ids of roster members in the receptionist's org
create or replace function public.receptionist_organization_barber_profile_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select ob.barber_profile_id
  from public.organization_barbers ob
  where ob.organization_id = public.receptionist_organization_id()
    and ob.barber_profile_id is not null;
$$;

grant execute on function public.receptionist_organization_barber_profile_ids() to authenticated;

-- 3) RLS policies for receptionist role:

-- barber_profiles: receptionist can see all profiles in their org
drop policy if exists "receptionist_select_org_barber_profiles" on public.barber_profiles;
create policy "receptionist_select_org_barber_profiles"
  on public.barber_profiles for select to authenticated
  using (id in (select public.receptionist_organization_barber_profile_ids()));

-- organization_barbers: receptionist can see all roster entries in their org
drop policy if exists "receptionist_select_org_barbers" on public.organization_barbers;
create policy "receptionist_select_org_barbers"
  on public.organization_barbers for select to authenticated
  using (organization_id = public.receptionist_organization_id());

-- barber_clients: receptionist can select/insert/update/delete any client in the org
drop policy if exists "receptionist_select_barber_clients" on public.barber_clients;
create policy "receptionist_select_barber_clients"
  on public.barber_clients for select to authenticated
  using (organization_id = public.receptionist_organization_id());

drop policy if exists "receptionist_insert_barber_clients" on public.barber_clients;
create policy "receptionist_insert_barber_clients"
  on public.barber_clients for insert to authenticated
  with check (organization_id = public.receptionist_organization_id());

drop policy if exists "receptionist_update_barber_clients" on public.barber_clients;
create policy "receptionist_update_barber_clients"
  on public.barber_clients for update to authenticated
  using (organization_id = public.receptionist_organization_id())
  with check (organization_id = public.receptionist_organization_id());

drop policy if exists "receptionist_delete_barber_clients" on public.barber_clients;
create policy "receptionist_delete_barber_clients"
  on public.barber_clients for delete to authenticated
  using (organization_id = public.receptionist_organization_id());

-- check_ins: receptionist can select/insert/update check_ins in the org
drop policy if exists "receptionist_select_check_ins" on public.check_ins;
create policy "receptionist_select_check_ins"
  on public.check_ins for select to authenticated
  using (organization_id = public.receptionist_organization_id());

drop policy if exists "receptionist_insert_check_ins" on public.check_ins;
create policy "receptionist_insert_check_ins"
  on public.check_ins for insert to authenticated
  with check (organization_id = public.receptionist_organization_id());

drop policy if exists "receptionist_update_check_ins" on public.check_ins;
create policy "receptionist_update_check_ins"
  on public.check_ins for update to authenticated
  using (organization_id = public.receptionist_organization_id())
  with check (organization_id = public.receptionist_organization_id());

-- chair_bookings: receptionist can select bookings in the org
drop policy if exists "receptionist_select_chair_bookings" on public.chair_bookings;
create policy "receptionist_select_chair_bookings"
  on public.chair_bookings for select to authenticated
  using (organization_id = public.receptionist_organization_id());

-- contracts: receptionist can select contracts in the org
drop policy if exists "receptionist_select_contracts" on public.contracts;
create policy "receptionist_select_contracts"
  on public.contracts for select to authenticated
  using (organization_id = public.receptionist_organization_id());

commit;
