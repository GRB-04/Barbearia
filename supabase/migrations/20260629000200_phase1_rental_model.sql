-- Phase 1: Consolidate the rental model
-- chair_bookings is the spine; contracts becomes a 1:1 child of a booking.
-- No data to migrate — no real production data exists yet.
-- Legacy owner-managed contracts (no booking parent) are deleted.
-- contracts.barber_id (legacy) is dropped; replaced by booking_id + barber_profile_id.

begin;

-- ============================================================
-- 1) Delete all legacy contracts — no real production data exists.
--    booking_id column doesn't exist yet, so we delete everything.
-- ============================================================
delete from public.contracts;

-- ============================================================
-- 2) Add booking_id (1:1 link to chair_bookings)
-- ============================================================
alter table public.contracts
  add column if not exists booking_id uuid
    references public.chair_bookings(id) on delete restrict;

-- Unique constraint enforces 1:1
create unique index if not exists contracts_booking_id_unique
  on public.contracts (booking_id)
  where booking_id is not null;

-- ============================================================
-- 3) Add barber_profile_id (sourced from the parent booking)
-- ============================================================
alter table public.contracts
  add column if not exists barber_profile_id uuid
    references public.barber_profiles(id) on delete restrict;

create index if not exists idx_contracts_barber_profile_id
  on public.contracts (barber_profile_id);

-- ============================================================
-- 4) Drop legacy barber_id column (was organization_barbers.id)
--    Drop any policies that reference it first.
-- ============================================================
drop policy if exists "contracts_select_owner_or_barber" on public.contracts;
drop policy if exists "barber_select_own_contracts" on public.contracts;
drop policy if exists "owner_select_org_contracts" on public.contracts;

alter table public.contracts
  drop column if exists barber_id;

-- ============================================================
-- 5) Trigger: booking confirmed → create contract
-- ============================================================
create or replace function public.trg_booking_confirmed_create_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fire on transition TO confirmed
  if (new.status = 'confirmed' and (old.status is distinct from 'confirmed')) then

    -- Idempotent: do nothing if a contract already exists for this booking
    if not exists (select 1 from public.contracts where booking_id = new.id) then
      insert into public.contracts (
        organization_id,
        chair_id,
        booking_id,
        barber_profile_id,
        start_at,
        end_at,
        status,
        billing_cycle,
        price
      ) values (
        new.organization_id,
        new.chair_id,
        new.id,
        new.barber_profile_id,
        new.start_at,
        new.end_at,
        'active',
        null,
        null
      );
    end if;

  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_confirmed_create_contract on public.chair_bookings;
create trigger trg_booking_confirmed_create_contract
  after update of status on public.chair_bookings
  for each row
  execute function public.trg_booking_confirmed_create_contract();

-- ============================================================
-- 6) Trigger: booking cancelled/rejected → void contract
-- ============================================================
create or replace function public.trg_booking_voided_void_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'rejected')
     and old.status not in ('cancelled', 'rejected') then

    update public.contracts
    set
      status = 'cancelled',
      updated_at = now()
    where booking_id = new.id
      and status not in ('cancelled');

  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_voided_void_contract on public.chair_bookings;
create trigger trg_booking_voided_void_contract
  after update of status on public.chair_bookings
  for each row
  execute function public.trg_booking_voided_void_contract();

-- ============================================================
-- 7) Handle instant-confirm: fire contract creation on INSERT
--    when the booking is created directly as 'confirmed'
-- ============================================================
create or replace function public.trg_booking_insert_confirmed_create_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' then
    insert into public.contracts (
      organization_id,
      chair_id,
      booking_id,
      barber_profile_id,
      start_at,
      end_at,
      status,
      billing_cycle,
      price
    ) values (
      new.organization_id,
      new.chair_id,
      new.id,
      new.barber_profile_id,
      new.start_at,
      new.end_at,
      'active',
      null,
      null
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_booking_insert_confirmed_create_contract on public.chair_bookings;
create trigger trg_booking_insert_confirmed_create_contract
  after insert on public.chair_bookings
  for each row
  execute function public.trg_booking_insert_confirmed_create_contract();

-- ============================================================
-- 8) RLS: barber sees only their own contracts via booking
-- ============================================================
alter table public.contracts enable row level security;

drop policy if exists "barber_sees_own_contracts" on public.contracts;
create policy "barber_sees_own_contracts"
  on public.contracts for select
  to authenticated
  using (
    barber_profile_id in (
      select id from public.barber_profiles where user_id = auth.uid()
    )
  );

drop policy if exists "owner_sees_org_contracts" on public.contracts;
create policy "owner_sees_org_contracts"
  on public.contracts for select
  to authenticated
  using (
    organization_id in (
      select id from public.organizations where owner_id = auth.uid()
    )
  );

-- Only DB triggers write contracts — no direct insert/update by clients
drop policy if exists "no_direct_contract_insert" on public.contracts;
drop policy if exists "no_direct_contract_update" on public.contracts;

-- ============================================================
-- 9) Owner can manage (approve/reject) booking status
-- ============================================================
drop policy if exists "owner_can_update_booking_status" on public.chair_bookings;
create policy "owner_can_update_booking_status"
  on public.chair_bookings for update
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
