begin;

-- ============================================================
-- FIX: bind_barber_profile_to_org FK violation
-- O trigger BEFORE tentava atualizar barbers(barber_profile_id)
-- com um ID que ainda não existia em barber_profiles.
-- Separamos em BEFORE (para setar org_id/role) e AFTER (para barbers).
-- ============================================================

-- 1) O trigger BEFORE: Apenas modifica a própria linha (NEW)
create or replace function public.bind_barber_profile_to_org_before()
returns trigger
language plpgsql
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

drop trigger if exists trg_bind_barber_profile_to_org on public.barber_profiles;
drop trigger if exists trg_bind_barber_profile_to_org_before on public.barber_profiles;

create trigger trg_bind_barber_profile_to_org_before
before insert or update of email on public.barber_profiles
for each row
execute function public.bind_barber_profile_to_org_before();


-- 2) O trigger AFTER: Atualiza a tabela barbers
create or replace function public.bind_barber_profile_to_org_after()
returns trigger
language plpgsql
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

drop trigger if exists trg_bind_barber_profile_to_org_after on public.barber_profiles;

create trigger trg_bind_barber_profile_to_org_after
after insert or update of email on public.barber_profiles
for each row
execute function public.bind_barber_profile_to_org_after();

-- Vamos rodar um comando rápido para resgatar usuários que
-- possam ter sido criados sem perfil por causa desse erro:
insert into public.barber_profiles (id, user_id, email, full_name)
select 
  gen_random_uuid(), 
  u.id, 
  u.email, 
  coalesce(u.raw_user_meta_data->>'full_name', u.email, 'Barbeiro')
from auth.users u
left join public.barber_profiles bp on bp.user_id = u.id
where bp.id is null
on conflict do nothing;

commit;
