-- Fix operating_hours key format mismatch
-- The app saves operating_hours with keys: monday, tuesday, wednesday...
-- But the validation function was reading keys: 0, 1, 2...
-- This migration replaces the validation function to use named keys.

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
  v_end_day_name text;

  v_start_config jsonb;
  v_end_config jsonb;

  v_start_open_str text;
  v_start_open boolean := false;

  v_start_hour time;
  v_end_hour time;

  v_start_allowed_start time;
  v_start_allowed_end time;
begin
  if p_location_operating_hours is null then
    return true; -- Se a unidade não definiu horas, assumimos que pode agendar
  end if;

  if p_end_at <= p_start_at then
    return false;
  end if;

  if (p_start_at::date <> p_end_at::date) then
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
    return true; -- Se o dia específico não existe, para não quebrar o MVP, assumimos livre
  end if;

  v_start_open_str := lower(coalesce(v_start_config ->> 'open', 'false'));
  
  -- Evitar erro: invalid input syntax for type boolean: "08:00"
  if v_start_open_str = 'true' or v_start_open_str = '1' or v_start_open_str = 't' then
    v_start_open := true;
  end if;

  if not v_start_open then
    return false; -- Loja fechada no dia
  end if;

  if (v_start_config ->> 'start') is null or (v_start_config ->> 'end') is null then
    return true; -- Loja está aberta, mas sem restrição de horas específicas.
  end if;

  v_start_hour := (p_start_at at time zone 'America/Sao_Paulo')::time;
  v_end_hour := (p_end_at at time zone 'America/Sao_Paulo')::time;

  -- Tentamos converter para time, se falhar, a exception pode quebrar. 
  -- No Postgres 12+ podemos usar blocos BEGIN..EXCEPTION, mas para garantir:
  begin
    v_start_allowed_start := (v_start_config ->> 'start')::time;
    v_start_allowed_end := (v_start_config ->> 'end')::time;
  exception when others then
    return true; -- Se as strings de horas ('08:00') estiverem mal formatadas no BD, liberamos para não travar
  end;

  if v_start_hour < v_start_allowed_start then
    return false;
  end if;

  if v_end_hour > v_start_allowed_end then
    return false;
  end if;

  return true;
end;
$$;
