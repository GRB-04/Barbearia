begin;

-- ============================================================
-- FIX: is_booking_within_location_hours
-- Suporta chaves numéricas ("1") e literais ("monday")
-- Suporta atributos "start"/"end" e "open"/"close" (legado)
-- ============================================================

create or replace function public.is_booking_within_location_hours(
  p_location_operating_hours jsonb,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns boolean
language plpgsql
stable
as $$
declare
  v_start_day int;
  v_end_day int;

  v_start_day_name text;
  v_end_day_name text;

  v_start_config jsonb;
  v_end_config jsonb;

  v_start_open boolean;
  v_end_open boolean;

  v_start_hour time;
  v_end_hour time;

  v_start_allowed_start time;
  v_start_allowed_end time;
  v_end_allowed_start time;
  v_end_allowed_end time;
begin
  if p_location_operating_hours is null then
    return false;
  end if;

  if p_end_at <= p_start_at then
    return false;
  end if;

  v_start_day := extract(dow from p_start_at);
  v_end_day := extract(dow from p_end_at);

  -- Nesta primeira versão do MVP, booking deve começar e terminar no mesmo dia.
  if (p_start_at::date <> p_end_at::date) then
    return false;
  end if;

  v_start_day_name := case v_start_day
    when 0 then 'sunday' when 1 then 'monday' when 2 then 'tuesday'
    when 3 then 'wednesday' when 4 then 'thursday' when 5 then 'friday'
    when 6 then 'saturday'
  end;
  
  v_end_day_name := case v_end_day
    when 0 then 'sunday' when 1 then 'monday' when 2 then 'tuesday'
    when 3 then 'wednesday' when 4 then 'thursday' when 5 then 'friday'
    when 6 then 'saturday'
  end;

  -- Tenta pegar tanto pelo índice numérico (ex: "1") quanto pelo nome ("monday")
  v_start_config := coalesce(
    p_location_operating_hours -> (v_start_day::text),
    p_location_operating_hours -> v_start_day_name
  );
  v_end_config := coalesce(
    p_location_operating_hours -> (v_end_day::text),
    p_location_operating_hours -> v_end_day_name
  );

  if v_start_config is null or v_end_config is null then
    return false;
  end if;

  -- Suporta "open": true ou "enabled": true
  v_start_open := coalesce(
    (v_start_config ->> 'open')::boolean, 
    (v_start_config ->> 'enabled')::boolean, 
    false
  );
  v_end_open := coalesce(
    (v_end_config ->> 'open')::boolean, 
    (v_end_config ->> 'enabled')::boolean, 
    false
  );

  if not v_start_open or not v_end_open then
    return false;
  end if;

  -- Suporta "start"/"end" ou "open"/"close" (quando open é string)
  if (v_start_config ->> 'start') is not null and (v_start_config ->> 'end') is not null then
    v_start_allowed_start := (v_start_config ->> 'start')::time;
    v_start_allowed_end := (v_start_config ->> 'end')::time;
  elsif (v_start_config ->> 'open') is not null and (v_start_config ->> 'close') is not null then
    v_start_allowed_start := (v_start_config ->> 'open')::time;
    v_start_allowed_end := (v_start_config ->> 'close')::time;
  else
    return false;
  end if;

  if (v_end_config ->> 'start') is not null and (v_end_config ->> 'end') is not null then
    v_end_allowed_start := (v_end_config ->> 'start')::time;
    v_end_allowed_end := (v_end_config ->> 'end')::time;
  elsif (v_end_config ->> 'open') is not null and (v_end_config ->> 'close') is not null then
    v_end_allowed_start := (v_end_config ->> 'open')::time;
    v_end_allowed_end := (v_end_config ->> 'close')::time;
  else
    return false;
  end if;

  v_start_hour := p_start_at::time;
  v_end_hour := p_end_at::time;

  if v_start_hour < v_start_allowed_start then
    return false;
  end if;

  if v_end_hour > v_end_allowed_end then
    return false;
  end if;

  return true;
end;
$$;

commit;
