-- Final fix for payments and bookings view
begin;

-- 1) Ensure payments has booking_id
do $$
begin
  if not exists (
    select 1 
    from information_schema.columns 
    where table_name = 'payments' 
    and column_name = 'booking_id'
  ) then
    alter table public.payments 
      add column booking_id uuid references public.chair_bookings(id) on delete set null;
  end if;
end
$$;

-- 2) Ensure index for performance
create index if not exists idx_payments_booking_id on public.payments(booking_id);

-- 3) Recreate the view with all necessary columns for MyBookingsPage
drop view if exists public.vw_barber_bookings;

create view public.vw_barber_bookings as
select
  cb.id,
  cb.barber_profile_id,
  cb.organization_id,
  cb.chair_id,
  cb.start_at,
  cb.end_at,
  cb.status,
  cb.notes,
  cb.created_at,
  c.identifier as chair_identifier,
  l.name as location_name,
  l.address as location_address,
  l.city as location_city,
  l.state as location_state,
  o.name as organization_name,
  p.status as payment_status,
  p.id as payment_id,
  p.amount as payment_amount
from public.chair_bookings cb
inner join public.chairs c          on c.id = cb.chair_id
inner join public.locations l       on l.id = c.location_id
inner join public.organizations o   on o.id = cb.organization_id
left  join public.payments p        on p.booking_id = cb.id;

-- 4) Permissions
grant select on public.vw_barber_bookings to authenticated;

-- 5) Ensure RLS for payments allows barbers to see their own payments
drop policy if exists "barbers_view_own_payments" on public.payments;
create policy "barbers_view_own_payments"
on public.payments
for select
to authenticated
using (
  exists (
    select 1
    from public.chair_bookings cb
    where cb.id = payments.booking_id
      and cb.barber_profile_id = public.current_barber_profile_id()
  )
);

commit;
