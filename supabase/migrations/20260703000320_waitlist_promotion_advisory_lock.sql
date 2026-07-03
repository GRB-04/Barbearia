-- Review da Task 3: promote_next_waitlist_for_chair tinha TOCTOU — duas transações
-- concorrentes (ex.: cancelamento manual + cron de expiração) podiam promover duas
-- entradas com períodos sobrepostos na mesma cadeira, travando ambas no enforcement.
-- Advisory lock transacional por cadeira serializa a promoção. Também adiciona
-- tiebreak determinístico (created_at, id) na ordem da fila.

begin;

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
  -- serializa promoções da mesma cadeira (evita dois holds sobrepostos)
  perform pg_advisory_xact_lock(hashtext(p_chair_id::text));

  for v_entry in
    select w.* from public.chair_waitlist w
    where w.chair_id = p_chair_id
      and w.status = 'waiting'
      and w.desired_start_at > now()
    order by w.created_at, w.id
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

commit;
