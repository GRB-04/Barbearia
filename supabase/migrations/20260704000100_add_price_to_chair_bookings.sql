begin;

alter table public.chair_bookings 
  add column if not exists price numeric not null default 50.00;

commit;
