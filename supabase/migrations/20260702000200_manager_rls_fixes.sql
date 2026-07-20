-- Manager role RLS fixes (post-review)
-- Addresses three findings from the whole-branch security review:
--   C1 (Critical): self-referential recursive policy on organization_barbers (SQLSTATE 42P17)
--   I2 (Important): manager reads were org-wide instead of location-scoped (cross-location PII)
--   I1 (Important): financial report empty for managers with only can_view_financials
begin;

-- ============================================================
-- C1: Drop the recursive roster policy.
-- The manager's OWN organization_barbers row is already readable via the
-- pre-existing "barbers_select_safe" policy (barber_profile_id = current_barber_profile_id(),
-- a SECURITY DEFINER helper — no recursion). No manager feature reads other roster rows,
-- so this additive policy is both unnecessary and the source of the infinite recursion.
-- ============================================================
drop policy if exists "manager_select_org_roster" on public.organization_barbers;

-- ============================================================
-- I2: Scope barber-profile visibility to the manager's LOCATION.
-- Barbers "of the point" = those with bookings on chairs at the managed location.
-- managed_location_id() is SECURITY DEFINER, so this does not recurse into
-- organization_barbers policies. Matches what fetchLocationBarbers() queries client-side.
-- ============================================================
drop policy if exists "manager_select_org_barber_profiles" on public.barber_profiles;

create policy "manager_select_location_barber_profiles"
  on public.barber_profiles for select to authenticated
  using (
    id in (
      select cb.barber_profile_id
      from public.chair_bookings cb
      join public.chairs c on c.id = cb.chair_id
      where c.location_id = public.managed_location_id()
    )
  );

-- ============================================================
-- I1: Allow managers with can_view_financials to READ payments (for the financial report).
-- UPDATE remains gated on can_manage_payments only (unchanged).
-- ============================================================
drop policy if exists "manager_select_location_payments" on public.payments;

create policy "manager_select_location_payments"
  on public.payments for select to authenticated
  using (
    (
      public.manager_has_permission('can_manage_payments')
      or public.manager_has_permission('can_view_financials')
    )
    and booking_id in (
      select cb.id from public.chair_bookings cb
      join public.chairs c on c.id = cb.chair_id
      where c.location_id = public.managed_location_id()
    )
  );

commit;
