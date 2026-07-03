begin;

-- 1) Promoção: percorre a fila da cadeira em ordem de chegada e promove
-- toda entrada cujo período desejado esteja totalmente livre e sem hold ativo.
create or replace function public.promote_next_waitlist_for_chair(p_chair_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry record;
  v_hold_minutes int;
  v_user_id uuid;
  v_chair_identifier text;
begin
  for v_entry in
    select w.* from public.chair_waitlist w
    where w.chair_id = p_chair_id
      and w.status = 'waiting'
      and w.desired_start_at > now()
    order by w.created_at
    for update skip locked
  loop
    -- período ainda ocupado por booking ativo?
    if exists (
      select 1 from public.chair_bookings cb
      where cb.chair_id = p_chair_id
        and cb.status in ('pending', 'confirmed')
        and tstzrange(cb.start_at, cb.end_at, '[)')
            && tstzrange(v_entry.desired_start_at, v_entry.desired_end_at, '[)')
    ) then
      continue;
    end if;

    -- período já prometido a outro hold ativo?
    if exists (
      select 1 from public.chair_waitlist w2
      where w2.chair_id = p_chair_id
        and w2.id <> v_entry.id
        and w2.status = 'hold'
        and w2.hold_expires_at > now()
        and tstzrange(w2.desired_start_at, w2.desired_end_at, '[)')
            && tstzrange(v_entry.desired_start_at, v_entry.desired_end_at, '[)')
    ) then
      continue;
    end if;

    select coalesce(o.waitlist_hold_minutes, 60) into v_hold_minutes
    from public.organizations o where o.id = v_entry.organization_id;

    update public.chair_waitlist
    set status = 'hold',
        hold_expires_at = now() + make_interval(mins => v_hold_minutes),
        notified_at = now()
    where id = v_entry.id;

    select bp.user_id into v_user_id
    from public.barber_profiles bp where bp.id = v_entry.barber_profile_id;
    select c.identifier into v_chair_identifier
    from public.chairs c where c.id = p_chair_id;

    if v_user_id is not null then
      insert into public.notifications (organization_id, user_id, title, body, type)
      values (
        v_entry.organization_id,
        v_user_id,
        'Vaga liberada na fila de espera!',
        format(
          'A cadeira %s vagou no período %s–%s de %s. Você tem %s minutos para confirmar a reserva.',
          coalesce(v_chair_identifier, ''),
          to_char(v_entry.desired_start_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
          to_char(v_entry.desired_end_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
          to_char(v_entry.desired_start_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'),
          v_hold_minutes
        ),
        'info'
      );
    end if;
  end loop;
end;
$$;

-- 2) Booking liberado (cancelado/rejeitado) → tenta promover a fila
create or replace function public.on_chair_booking_released()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('cancelled', 'rejected')
     and old.status in ('pending', 'confirmed') then
    perform public.promote_next_waitlist_for_chair(new.chair_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chair_booking_released_promote on public.chair_bookings;
create trigger trg_chair_booking_released_promote
after update on public.chair_bookings
for each row execute function public.on_chair_booking_released();

-- 3) Enforcement: hold ativo bloqueia booking de terceiros no período
create or replace function public.enforce_waitlist_hold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('pending', 'confirmed') and exists (
    select 1 from public.chair_waitlist w
    where w.chair_id = new.chair_id
      and w.status = 'hold'
      and w.hold_expires_at > now()
      and w.barber_profile_id <> new.barber_profile_id
      and tstzrange(w.desired_start_at, w.desired_end_at, '[)')
          && tstzrange(new.start_at, new.end_at, '[)')
  ) then
    raise exception 'Este horário está reservado temporariamente para outro barbeiro da fila de espera.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_waitlist_hold on public.chair_bookings;
create trigger trg_enforce_waitlist_hold
before insert on public.chair_bookings
for each row execute function public.enforce_waitlist_hold();

-- 4) Conversão: dono do hold reservou → entrada vira converted
create or replace function public.convert_waitlist_hold_on_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chair_waitlist w
  set status = 'converted', converted_booking_id = new.id
  where w.chair_id = new.chair_id
    and w.barber_profile_id = new.barber_profile_id
    and w.status = 'hold'
    and w.hold_expires_at > now()
    and tstzrange(w.desired_start_at, w.desired_end_at, '[)')
        && tstzrange(new.start_at, new.end_at, '[)');
  return new;
end;
$$;

drop trigger if exists trg_convert_waitlist_hold on public.chair_bookings;
create trigger trg_convert_waitlist_hold
after insert on public.chair_bookings
for each row execute function public.convert_waitlist_hold_on_booking();

-- 5) Hold liberado (cancelado/expirado) → promove o próximo
create or replace function public.on_waitlist_hold_released()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'hold' and new.status in ('cancelled', 'expired') then
    perform public.promote_next_waitlist_for_chair(new.chair_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_waitlist_hold_released on public.chair_waitlist;
create trigger trg_waitlist_hold_released
after update on public.chair_waitlist
for each row execute function public.on_waitlist_hold_released();

-- 6) Expiração periódica (chamada pelo pg_cron; segura para chamar a qualquer momento)
create or replace function public.expire_waitlist_entries()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- entradas esperando um período que já começou
  update public.chair_waitlist
  set status = 'expired'
  where status = 'waiting' and desired_start_at <= now();

  -- holds vencidos (o trigger trg_waitlist_hold_released promove os próximos)
  update public.chair_waitlist
  set status = 'expired'
  where status = 'hold' and hold_expires_at <= now();
end;
$$;

commit;
