-- Migration: QR Code Access Gate — public (anon) read on barber_profiles & organizations,
-- anon insert into audit_logs, check_ins, barber_clients, notifications for QR access registration,
-- and authenticated select on audit_logs for receptionists/managers.
-- The /access/:barberId page is public (no login required).

begin;

-- ── 1. barber_profiles: allow anon to SELECT by id ──────────────────────────
drop policy if exists "barber_profiles_select_anon_qr" on public.barber_profiles;
create policy "barber_profiles_select_anon_qr"
  on public.barber_profiles
  for select
  to anon
  using (true);

grant select (id, user_id, full_name, role, organization_id, email, phone)
  on public.barber_profiles
  to anon;

-- ── 2. organizations: allow anon to SELECT name ──────────────────────────────
drop policy if exists "organizations_select_anon_qr" on public.organizations;
create policy "organizations_select_anon_qr"
  on public.organizations
  for select
  to anon
  using (true);

grant select (id, name, owner_id)
  on public.organizations
  to anon;

-- ── 3. organization_barbers, contracts, chair_bookings: allow anon SELECT to resolve org ──
drop policy if exists "organization_barbers_select_anon_qr" on public.organization_barbers;
create policy "organization_barbers_select_anon_qr"
  on public.organization_barbers for select to anon using (true);
grant select (organization_id, barber_profile_id, user_id, role) on public.organization_barbers to anon;

drop policy if exists "contracts_select_anon_qr" on public.contracts;
create policy "contracts_select_anon_qr"
  on public.contracts for select to anon using (true);
grant select (organization_id, barber_profile_id, status) on public.contracts to anon;

drop policy if exists "chair_bookings_select_anon_qr" on public.chair_bookings;
create policy "chair_bookings_select_anon_qr"
  on public.chair_bookings for select to anon using (true);
grant select (organization_id, barber_profile_id, status) on public.chair_bookings to anon;

-- ── 4. barber_clients: allow anon to SELECT and INSERT for QR gate ────────────
drop policy if exists "barber_clients_select_anon_qr" on public.barber_clients;
create policy "barber_clients_select_anon_qr"
  on public.barber_clients
  for select
  to anon
  using (true);

drop policy if exists "barber_clients_insert_anon_qr" on public.barber_clients;
create policy "barber_clients_insert_anon_qr"
  on public.barber_clients
  for insert
  to anon
  with check (true);

grant select, insert
  on public.barber_clients
  to anon;

-- ── 5. check_ins: allow anon to INSERT for QR gate ───────────────────────────
drop policy if exists "check_ins_insert_anon_qr" on public.check_ins;
create policy "check_ins_insert_anon_qr"
  on public.check_ins
  for insert
  to anon
  with check (status = 'checked_in');

grant insert
  on public.check_ins
  to anon;

-- ── 6. audit_logs: allow anon INSERT for QR access events ───────────────────
drop policy if exists "audit_logs_insert_anon_qr" on public.audit_logs;
create policy "audit_logs_insert_anon_qr"
  on public.audit_logs
  for insert
  to anon
  with check (action = 'qr_access_granted');

grant insert (action, entity, entity_id, organization_id, metadata)
  on public.audit_logs
  to anon;

-- ── 7. notifications: allow anon INSERT for QR access notifications ─────────
drop policy if exists "notifications_insert_anon_qr" on public.notifications;
create policy "notifications_insert_anon_qr"
  on public.notifications
  for insert
  to anon
  with check (type = 'qr_access');

grant insert
  on public.notifications
  to anon;

-- ── 8. notifications: allow org staff (receptionist, owner, manager, barber) to SELECT ──
drop policy if exists "notifications_select_org_staff" on public.notifications;
create policy "notifications_select_org_staff"
  on public.notifications
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or organization_id = public.receptionist_organization_id()
    or organization_id in (select id from public.organizations where owner_id = auth.uid())
    or organization_id in (select organization_id from public.organization_barbers where user_id = auth.uid())
  );

grant select on public.notifications to authenticated;

-- ── 9. audit_logs: allow org members (receptionist, owner, manager) to SELECT ──
drop policy if exists "audit_logs_select_org_members" on public.audit_logs;
create policy "audit_logs_select_org_members"
  on public.audit_logs
  for select
  to authenticated
  using (
    organization_id = public.receptionist_organization_id()
    or organization_id in (select id from public.organizations where owner_id = auth.uid())
    or organization_id in (select organization_id from public.organization_barbers where user_id = auth.uid())
  );

grant select on public.audit_logs to authenticated;

commit;




