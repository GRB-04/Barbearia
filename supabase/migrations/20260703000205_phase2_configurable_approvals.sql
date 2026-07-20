begin;

-- ============================================================
-- 1) ADICIONAR COLUNAS DE CONFIGURAÇÃO
-- ============================================================
alter table public.organizations 
  add column if not exists auto_confirm_bookings boolean not null default true;

alter table public.locations 
  add column if not exists auto_confirm_bookings boolean default null;


-- ============================================================
-- 2) TRIGGER ANTES DE INSERIR RESERVA (RESOLUÇÃO DE STATUS)
-- ============================================================
create or replace function public.set_initial_booking_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto_confirm boolean;
begin
  -- Resolve a herança de configuração: local -> organização -> padrão (true)
  select coalesce(l.auto_confirm_bookings, o.auto_confirm_bookings, true)
    into v_auto_confirm
  from public.chairs c
  join public.locations l on l.id = c.location_id
  join public.organizations o on o.id = l.organization_id
  where c.id = new.chair_id;

  if v_auto_confirm then
    new.status := 'confirmed';
  else
    new.status := 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_initial_booking_status on public.chair_bookings;

create trigger trg_set_initial_booking_status
before insert on public.chair_bookings
for each row
execute function public.set_initial_booking_status();

commit;
