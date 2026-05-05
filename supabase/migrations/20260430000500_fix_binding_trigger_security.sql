begin;

-- ============================================================
-- FIX: bind_barber_profile_to_org (SECURITY DEFINER)
-- O trigger estava rodando com as permissões do usuário recém-criado,
-- mas RLS não permitia que ele fizesse UPDATE na tabela 'barbers'.
-- Adicionado SECURITY DEFINER para rodar com permissões de bypass.
-- ============================================================

create or replace function public.bind_barber_profile_to_org_before()
returns trigger
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
  v_role public.app_role;
begin
  if new.email is null then
    return new;
  end if;

  select b.organization_id, b.role
    into v_org_id, v_role
  from public.barbers b
  where b.email is not null
    and lower(trim(b.email)) = lower(trim(new.email))
  order by b.created_at asc
  limit 1;

  if v_org_id is not null then
    new.organization_id := v_org_id;
  end if;

  if v_role is not null then
    new.role := v_role;
  end if;

  return new;
end;
$$;

create or replace function public.bind_barber_profile_to_org_after()
returns trigger
language plpgsql
security definer
as $$
declare
  v_barber_id uuid;
begin
  if new.email is null then
    return null;
  end if;

  select b.id
    into v_barber_id
  from public.barbers b
  where b.email is not null
    and lower(trim(b.email)) = lower(trim(new.email))
  order by b.created_at asc
  limit 1;

  if v_barber_id is not null then
    update public.barbers
    set barber_profile_id = new.id
    where id = v_barber_id
      and (barber_profile_id is distinct from new.id);
  end if;

  return null;
end;
$$;

-- Refazer o vínculo manualmente para as contas que falharam (como o devbarber):
update public.barber_profiles bp
set 
  organization_id = b.organization_id,
  role = b.role
from public.barbers b
where lower(trim(bp.email)) = lower(trim(b.email))
  and bp.organization_id is null;

update public.barbers b
set barber_profile_id = bp.id
from public.barber_profiles bp
where lower(trim(b.email)) = lower(trim(bp.email))
  and (b.barber_profile_id is null or b.barber_profile_id is distinct from bp.id);

commit;
