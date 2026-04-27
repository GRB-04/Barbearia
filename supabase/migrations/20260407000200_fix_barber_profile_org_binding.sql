begin;

-- =========================================================
-- F003 - Controle de usuários por tenant
-- Fixar vínculo real do barbeiro com a organização
-- =========================================================

-- 1. Garantir coluna organization_id em barber_profiles
alter table public.barber_profiles
add column if not exists organization_id uuid references public.organizations(id) on delete cascade;

create index if not exists idx_barber_profiles_organization_id
  on public.barber_profiles (organization_id);

-- 2. Garantir coluna barber_profile_id em barbers
alter table public.barbers
add column if not exists barber_profile_id uuid references public.barber_profiles(id) on delete set null;

create index if not exists idx_barbers_barber_profile_id
  on public.barbers (barber_profile_id);

-- 3. Backfill do vínculo barbers -> barber_profiles por email
update public.barbers b
set barber_profile_id = bp.id
from public.barber_profiles bp
where b.email is not null
  and bp.email is not null
  and lower(trim(b.email)) = lower(trim(bp.email))
  and (b.barber_profile_id is distinct from bp.id);

-- 4. Backfill do organization_id em barber_profiles
-- prioridade:
--   a) pela ligação barbers.barber_profile_id
--   b) por email correspondente
update public.barber_profiles bp
set organization_id = src.organization_id
from (
  select distinct
    bp2.id as barber_profile_id,
    b.organization_id
  from public.barber_profiles bp2
  join public.barbers b
    on b.barber_profile_id = bp2.id
    or (
      b.email is not null
      and bp2.email is not null
      and lower(trim(b.email)) = lower(trim(bp2.email))
    )
) as src
where bp.id = src.barber_profile_id
  and bp.organization_id is null;

-- 5. Função segura:
-- quando criar/atualizar barber_profile, se existir barber interno com mesmo email,
-- preencher organization_id e também barber_profile_id do cadastro interno
create or replace function public.bind_barber_profile_to_org()
returns trigger
language plpgsql
as $$
declare
  v_barber_id uuid;
  v_org_id uuid;
begin
  if new.email is null then
    return new;
  end if;

  select b.id, b.organization_id
    into v_barber_id, v_org_id
  from public.barbers b
  where b.email is not null
    and lower(trim(b.email)) = lower(trim(new.email))
  order by b.created_at asc
  limit 1;

  if v_org_id is not null then
    new.organization_id := v_org_id;
  end if;

  if v_barber_id is not null then
    update public.barbers
    set barber_profile_id = new.id
    where id = v_barber_id
      and (barber_profile_id is distinct from new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bind_barber_profile_to_org on public.barber_profiles;

create trigger trg_bind_barber_profile_to_org
before insert or update of email on public.barber_profiles
for each row
execute function public.bind_barber_profile_to_org();

commit;