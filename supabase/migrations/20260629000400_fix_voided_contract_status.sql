-- Fix: contract void trigger should set status = 'voided', not 'cancelled'.
-- 'voided' is the correct soft-delete state for legal records (row is kept for audit).
-- 'cancelled' is reserved for contracts cancelled before they were confirmed.

begin;

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
      status = 'voided',
      updated_at = now()
    where booking_id = new.id
      and status not in ('voided', 'cancelled');

  end if;

  return new;
end;
$$;

commit;
