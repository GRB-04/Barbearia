-- Support both operating_hours formats currently written by the app:
-- 1) named keys: monday.open/start/end
-- 2) numeric keys: 1.enabled/open/close

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
  v_start_day_name text;
  v_start_config jsonb;
  v_is_open boolean := false;
  v_open_text text;
  v_close_text text;
  v_start_hour time;
  v_end_hour time;
  v_allowed_start time;
  v_allowed_end time;
begin
  if p_location_operating_hours is null then
    return true;
  end if;

  if p_end_at <= p_start_at then
    return false;
  end if;

  if (p_start_at at time zone 'America/Sao_Paulo')::date
     <> (p_end_at at time zone 'America/Sao_Paulo')::date then
    return false;
  end if;

  v_start_day := extract(dow from p_start_at at time zone 'America/Sao_Paulo');

  v_start_day_name := case v_start_day
    when 0 then 'sunday'
    when 1 then 'monday'
    when 2 then 'tuesday'
    when 3 then 'wednesday'
    when 4 then 'thursday'
    when 5 then 'friday'
    when 6 then 'saturday'
    else null
  end;

  if v_start_day_name is null then
    return false;
  end if;

  v_start_config := coalesce(
    p_location_operating_hours -> v_start_day_name,
    p_location_operating_hours -> (v_start_day::text)
  );

  if v_start_config is null then
    return true;
  end if;

  if v_start_config ? 'enabled' then
    v_is_open := coalesce((v_start_config ->> 'enabled')::boolean, false);
    v_open_text := v_start_config ->> 'open';
    v_close_text := v_start_config ->> 'close';
  else
    v_is_open := coalesce((v_start_config ->> 'open')::boolean, false);
    v_open_text := v_start_config ->> 'start';
    v_close_text := v_start_config ->> 'end';
  end if;

  if not v_is_open then
    return false;
  end if;

  if v_open_text is null or v_close_text is null then
    return true;
  end if;

  begin
    v_allowed_start := v_open_text::time;
    v_allowed_end := v_close_text::time;
  exception when others then
    return true;
  end;

  v_start_hour := (p_start_at at time zone 'America/Sao_Paulo')::time;
  v_end_hour := (p_end_at at time zone 'America/Sao_Paulo')::time;

  return v_start_hour >= v_allowed_start and v_end_hour <= v_allowed_end;
end;
$$;
