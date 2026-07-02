-- Phase 2: Configurable booking approval
-- org-level default (auto_confirm_bookings boolean NOT NULL DEFAULT true)
-- location-level override (nullable — NULL means inherit from org)
-- Resolution: COALESCE(location.auto_confirm_bookings, org.auto_confirm_bookings)

begin;

-- 1) Org-level default
alter table public.organizations
  add column if not exists auto_confirm_bookings boolean not null default true;

-- 2) Location-level override (NULL = inherit from org)
alter table public.locations
  add column if not exists auto_confirm_bookings boolean null;

-- 3) RLS: only org owner may write the setting
drop policy if exists "owner_update_org_auto_confirm" on public.organizations;
create policy "owner_update_org_auto_confirm"
  on public.organizations for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "owner_update_location_auto_confirm" on public.locations;
create policy "owner_update_location_auto_confirm"
  on public.locations for update
  to authenticated
  using (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  )
  with check (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );

commit;
