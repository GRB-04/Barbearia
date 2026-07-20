-- Fix contract auto-creation on booking confirmation.
--
-- Both trigger functions inserted into contracts without start_date (NOT NULL, no
-- default) and passed billing_cycle / price as explicit NULL, overriding their column
-- defaults ('monthly' / 0.00) and violating NOT NULL. Renting a chair therefore failed
-- with: null value in column "start_date" of relation "contracts".
--
-- Fix: derive start_date/end_date from start_at/end_at and omit billing_cycle/price so
-- their defaults apply.
begin;

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
        start_date,
        end_date,
        status
      ) values (
        new.organization_id,
        new.chair_id,
        new.id,
        new.barber_profile_id,
        new.start_at,
        new.end_at,
        new.start_at::date,
        new.end_at::date,
        'active'
      );
    end if;
  end if;

  return new;
end;
$$;

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
      start_date,
      end_date,
      status
    ) values (
      new.organization_id,
      new.chair_id,
      new.id,
      new.barber_profile_id,
      new.start_at,
      new.end_at,
      new.start_at::date,
      new.end_at::date,
      'active'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

commit;
