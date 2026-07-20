begin;

-- Barbeiro só pode CANCELAR a própria entrada (policy chair_waitlist_update_own_cancel
-- já força status final = 'cancelled'), mas a policy não congela as demais colunas.
-- Este trigger preserva os valores antigos em qualquer UPDATE que resulte em
-- status = 'cancelled'. O engine (promoção/expiração/conversão) nunca seta
-- 'cancelled', então não é afetado.
create or replace function public.protect_chair_waitlist_cancel()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'cancelled' then
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

drop trigger if exists trg_protect_chair_waitlist_cancel on public.chair_waitlist;
create trigger trg_protect_chair_waitlist_cancel
before update on public.chair_waitlist
for each row execute function public.protect_chair_waitlist_cancel();

commit;
