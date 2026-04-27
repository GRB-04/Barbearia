begin;

-- =========================================================
-- INDICES ESSENCIAIS
-- reduzir custo de RLS e queries frequentes
-- =========================================================

create index if not exists idx_organizations_owner_id
  on public.organizations (owner_id);

create index if not exists idx_locations_organization_id
  on public.locations (organization_id);

create index if not exists idx_locations_organization_status
  on public.locations (organization_id, status);

create index if not exists idx_locations_created_at
  on public.locations (created_at desc);

create index if not exists idx_chairs_location_id
  on public.chairs (location_id);

create index if not exists idx_chairs_location_identifier
  on public.chairs (location_id, identifier);

create index if not exists idx_chairs_location_status
  on public.chairs (location_id, status);

create index if not exists idx_barber_profiles_user_id
  on public.barber_profiles (user_id);

create index if not exists idx_barber_profiles_organization_id
  on public.barber_profiles (organization_id);

create index if not exists idx_barber_profiles_email_lower
  on public.barber_profiles ((lower(email)));

create index if not exists idx_barbers_organization_id
  on public.barbers (organization_id);

create index if not exists idx_barbers_barber_profile_id
  on public.barbers (barber_profile_id);

create index if not exists idx_barbers_email_lower
  on public.barbers ((lower(email)));

create index if not exists idx_chair_bookings_barber_profile_id
  on public.chair_bookings (barber_profile_id);

create index if not exists idx_chair_bookings_organization_id
  on public.chair_bookings (organization_id);

create index if not exists idx_chair_bookings_chair_id
  on public.chair_bookings (chair_id);

create index if not exists idx_chair_bookings_start_at
  on public.chair_bookings (start_at);

create index if not exists idx_chair_bookings_end_at
  on public.chair_bookings (end_at);

create index if not exists idx_chair_bookings_chair_dates
  on public.chair_bookings (chair_id, start_at, end_at);

create index if not exists idx_chair_bookings_barber_dates
  on public.chair_bookings (barber_profile_id, start_at, end_at);

create index if not exists idx_contracts_organization_id
  on public.contracts (organization_id);

create index if not exists idx_contracts_chair_id
  on public.contracts (chair_id);

create index if not exists idx_contracts_barber_id
  on public.contracts (barber_id);

create index if not exists idx_payments_organization_id
  on public.payments (organization_id);

create index if not exists idx_payments_contract_id
  on public.payments (contract_id);

commit;