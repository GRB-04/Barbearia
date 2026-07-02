-- Raise the per-location capacity cap from 5 to 50.
-- The original constraint (capacity between 1 and 5) is below the business model,
-- which allows points with 6+ chairs. Widen the upper bound to 50.
begin;

alter table public.locations
  drop constraint if exists locations_capacity_check;

alter table public.locations
  add constraint locations_capacity_check
  check (capacity >= 1 and capacity <= 50);

commit;
