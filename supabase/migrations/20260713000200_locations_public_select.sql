-- Migration: restore locations_select_public and chair_bookings_select_public policies for marketplace compatibility
begin;

drop policy if exists "locations_select_public" on public.locations;
create policy "locations_select_public"
  on public.locations for select to authenticated
  using (true);

drop policy if exists "chair_bookings_select_public" on public.chair_bookings;
create policy "chair_bookings_select_public"
  on public.chair_bookings for select to authenticated
  using (true);

commit;
