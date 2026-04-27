begin;

-- =========================================================
-- FIX: João Pedro deve ser BARBEIRO, não OWNER
-- =========================================================
-- Cenário atual:
-- - joaopedro123@gmail.com está com uma organization própria por engano
-- - o correto é: ele ter login + barber_profile + vínculo em public.barbers
-- =========================================================

-- -----------------------------------------
-- 1. Garantir coluna de vínculo no cadastro interno de barbeiros
-- -----------------------------------------
alter table public.barbers
add column if not exists barber_profile_id uuid references public.barber_profiles(id) on delete set null;

create index if not exists idx_barbers_barber_profile_id
  on public.barbers(barber_profile_id);

create index if not exists idx_barbers_email_lower
  on public.barbers(lower(email));

create index if not exists idx_barber_profiles_email_lower
  on public.barber_profiles(lower(email));

-- -----------------------------------------
-- 2. Garantir barber_profile para João
-- -----------------------------------------
insert into public.barber_profiles (
  user_id,
  full_name,
  phone,
  email,
  created_at
)
select
  u.id,
  coalesce(nullif(trim(split_part(u.email, '@', 1)), ''), 'João Pedro'),
  null,
  u.email,
  now()
from auth.users u
where lower(u.email) = lower('joaopedro123@gmail.com')
  and not exists (
    select 1
    from public.barber_profiles bp
    where bp.user_id = u.id
  );

-- -----------------------------------------
-- 3. Ligar cadastro interno do barbeiro ao login dele por email
-- -----------------------------------------
update public.barbers b
set barber_profile_id = bp.id
from public.barber_profiles bp
where lower(trim(b.email)) = lower(trim(bp.email))
  and lower(trim(bp.email)) = lower('joaopedro123@gmail.com')
  and (b.barber_profile_id is distinct from bp.id);

-- -----------------------------------------
-- 4. Validar se existe cadastro interno do João em public.barbers
-- Se não existir, cria um dentro da organization do owner1
--
-- owner1 org:
-- b4cc523d-6965-4fcc-9058-bd6d9b45ca4c
-- -----------------------------------------
insert into public.barbers (
  organization_id,
  full_name,
  email,
  phone,
  barber_profile_id,
  created_at
)
select
  'b4cc523d-6965-4fcc-9058-bd6d9b45ca4c'::uuid,
  coalesce(bp.full_name, 'João Pedro'),
  bp.email,
  bp.phone,
  bp.id,
  now()
from public.barber_profiles bp
where lower(bp.email) = lower('joaopedro123@gmail.com')
  and not exists (
    select 1
    from public.barbers b
    where lower(trim(b.email)) = lower('joaopedro123@gmail.com')
       or b.barber_profile_id = bp.id
  );

-- -----------------------------------------
-- 5. Apagar organization acidental do João
-- Só apaga se estiver vazia.
-- Se tiver dados dependentes, aborta com erro para não perder dados.
--
-- organization acidental do João:
-- ab6f17ed-36cb-40d1-a714-a576c79872bc
-- -----------------------------------------
do $$
declare
  v_org_id uuid := 'ab6f17ed-36cb-40d1-a714-a576c79872bc'::uuid;
  v_has_locations boolean;
  v_has_contracts boolean;
  v_has_payments boolean;
  v_has_bookings boolean;
  v_has_barbers boolean;
begin
  select exists (
    select 1 from public.locations l where l.organization_id = v_org_id
  ) into v_has_locations;

  select exists (
    select 1 from public.contracts c where c.organization_id = v_org_id
  ) into v_has_contracts;

  select exists (
    select 1 from public.payments p where p.organization_id = v_org_id
  ) into v_has_payments;

  select exists (
    select 1 from public.chair_bookings cb where cb.organization_id = v_org_id
  ) into v_has_bookings;

  select exists (
    select 1 from public.barbers b where b.organization_id = v_org_id
  ) into v_has_barbers;

  if v_has_locations or v_has_contracts or v_has_payments or v_has_bookings or v_has_barbers then
    raise exception 'A organization acidental do João não está vazia. Limpe os dados antes de apagar.';
  end if;

  delete from public.organizations
  where id = v_org_id
    and owner_id = (
      select u.id
      from auth.users u
      where lower(u.email) = lower('joaopedro123@gmail.com')
      limit 1
    );
end $$;

-- -----------------------------------------
-- 6. Função de sync automática por email
-- Sempre que surgir barber_profile ou barber interno com mesmo email, vincula
-- -----------------------------------------
create or replace function public.sync_barber_profile_link()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'barber_profiles' then
    if new.email is not null then
      update public.barbers b
      set barber_profile_id = new.id
      where b.email is not null
        and lower(trim(b.email)) = lower(trim(new.email))
        and (b.barber_profile_id is distinct from new.id);
    end if;
    return new;
  end if;

  if tg_table_name = 'barbers' then
    if new.email is not null and new.barber_profile_id is null then
      update public.barbers b
      set barber_profile_id = bp.id
      from public.barber_profiles bp
      where b.id = new.id
        and bp.email is not null
        and lower(trim(bp.email)) = lower(trim(new.email))
        and (b.barber_profile_id is distinct from bp.id);
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_barber_profile_link_from_profiles on public.barber_profiles;
create trigger trg_sync_barber_profile_link_from_profiles
after insert or update of email on public.barber_profiles
for each row
execute function public.sync_barber_profile_link();

drop trigger if exists trg_sync_barber_profile_link_from_barbers on public.barbers;
create trigger trg_sync_barber_profile_link_from_barbers
after insert or update of email on public.barbers
for each row
execute function public.sync_barber_profile_link();

commit;