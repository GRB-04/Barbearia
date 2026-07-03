-- Fixes do review final da branch:
-- 1) Os REVOKEs de 000410 eram inócuos — o grant default a PUBLIC sobrevive.
-- 2) chair_waitlist_same_day_check comparava datas em UTC: período 18h–22h no
--    Brasil (UTC-3) cruza meia-noite UTC e era rejeitado, embora reservável.
--    Passa a comparar no fuso do produto (America/Sao_Paulo — fixo nas Settings).
-- 3) Congela também o id (PK) no cancel (achado menor do review da Task 2).

begin;

-- 1) revokes efetivos (inclui PUBLIC)
revoke execute on function public.promote_next_waitlist_for_chair(uuid) from public, anon, authenticated;
revoke execute on function public.expire_waitlist_entries() from public, anon, authenticated;
revoke execute on function public.my_waitlist_positions() from public, anon;
grant execute on function public.my_waitlist_positions() to authenticated;

-- 2) same-day no fuso do produto
alter table public.chair_waitlist drop constraint if exists chair_waitlist_same_day_check;
alter table public.chair_waitlist add constraint chair_waitlist_same_day_check
  check (
    (desired_start_at at time zone 'America/Sao_Paulo')::date
    = (desired_end_at at time zone 'America/Sao_Paulo')::date
  );

-- 3) congela id no cancel
create or replace function public.protect_chair_waitlist_cancel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'cancelled' then
    new.id := old.id;
    new.chair_id := old.chair_id;
    new.barber_profile_id := old.barber_profile_id;
    new.location_id := old.location_id;
    new.organization_id := old.organization_id;
    new.desired_start_at := old.desired_start_at;
    new.desired_end_at := old.desired_end_at;
    new.hold_expires_at := old.hold_expires_at;
    new.notified_at := old.notified_at;
    new.converted_booking_id := old.converted_booking_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

commit;
