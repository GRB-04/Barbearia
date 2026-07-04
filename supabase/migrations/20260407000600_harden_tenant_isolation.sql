begin;

-- =========================================================
-- BarberHouse CONNECT
-- HARDENING DE ISOLAMENTO MULTI-TENANT (F002)
-- =========================================================
--
-- Objetivo:
-- - remover políticas permissivas
-- - garantir isolamento real entre tenants
-- - manter owner vendo apenas sua organização
-- - permitir barbeiro ver apenas a organização à qual está vinculado
-- - impedir chair_bookings inconsistentes
--
-- Tabelas consideradas:
-- public.organizations
-- public.locations
-- public.chairs
-- public.barbers
-- public.barber_profiles
-- public.chair_bookings
--
-- IMPORTANTE:
-- Esta migration assume os nomes encontrados nas migrations que você mostrou.
-- =========================================================


-- =========================================================
-- 0) Garantir coluna de vínculo entre barber interno e login
-- =========================================================
-- Você comentou que já existe vínculo automático por email e que a UI
-- mostra "Linked to login". Como isso não apareceu claramente nas migrations
-- encontradas, vamos garantir essa coluna no banco.

alter table public.barbers
add column if not exists barber_profile_id uuid references public.barber_profiles(id) on delete set null;

create index if not exists idx_barbers_barber_profile_id
  on public.barbers(barber_profile_id);

create index if not exists idx_barbers_email_lower
  on public.barbers(lower(email));

create index if not exists idx_barber_profiles_email_lower
  on public.barber_profiles(lower(email));

-- Backfill do vínculo por email, sem sobrescrever vínculo já existente
update public.barbers b
set barber_profile_id = bp.id
from public.barber_profiles bp
where b.barber_profile_id is null
  and b.email is not null
  and bp.email is not null
  and lower(trim(b.email)) = lower(trim(bp.email));


-- =========================================================
-- 1) Trigger para manter vínculo automático por email
-- =========================================================

create or replace function public.sync_barber_profile_link()
returns trigger
language plpgsql
as $$
begin
  -- Se um barber interno tem email igual ao barber_profile, vincula
  if tg_table_name = 'barber_profiles' then
    if new.email is not null then
      update public.barbers b
      set barber_profile_id = new.id
      where b.barber_profile_id is null
        and b.email is not null
        and lower(trim(b.email)) = lower(trim(new.email));
    end if;
    return new;
  end if;

  -- Se um barber interno foi criado/alterado e existir profile com mesmo email, vincula
  if tg_table_name = 'barbers' then
    if new.email is not null and new.barber_profile_id is null then
      update public.barbers b
      set barber_profile_id = bp.id
      from public.barber_profiles bp
      where b.id = new.id
        and bp.email is not null
        and lower(trim(bp.email)) = lower(trim(new.email));
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


-- =========================================================
-- 2) Funções auxiliares de acesso
-- =========================================================

-- Perfil de barbeiro do usuário autenticado
create or replace function public.current_barber_profile_id()
returns uuid
language sql
stable
as $$
  select bp.id
  from public.barber_profiles bp
  where bp.user_id = auth.uid()
  limit 1;
$$;

-- Organizações acessíveis pelo usuário:
-- - owner: organizações onde owner_id = auth.uid()
-- - barber: organizações em que existe registro em public.barbers
--           vinculado ao barber_profile do usuário
create or replace function public.user_has_access_to_organization(p_organization_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.owner_id = auth.uid()
  )
  or exists (
    select 1
    from public.barbers b
    where b.organization_id = p_organization_id
      and b.barber_profile_id = public.current_barber_profile_id()
  );
$$;

-- Verifica se o usuário autenticado pode acessar uma location
create or replace function public.user_has_access_to_location(p_location_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.locations l
    where l.id = p_location_id
      and public.user_has_access_to_organization(l.organization_id)
  );
$$;

-- Verifica se o usuário autenticado pode acessar uma chair
create or replace function public.user_has_access_to_chair(p_chair_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.chairs c
    join public.locations l on l.id = c.location_id
    where c.id = p_chair_id
      and public.user_has_access_to_organization(l.organization_id)
  );
$$;

-- Retorna organization_id da chair
create or replace function public.get_chair_organization_id(p_chair_id uuid)
returns uuid
language sql
stable
as $$
  select l.organization_id
  from public.chairs c
  join public.locations l on l.id = c.location_id
  where c.id = p_chair_id
  limit 1;
$$;


-- =========================================================
-- 3) Remover policies permissivas que quebram o isolamento
-- =========================================================

drop policy if exists "Authenticated users can browse locations" on public.locations;
drop policy if exists "Authenticated users can browse chairs" on public.chairs;
drop policy if exists "Authenticated users can browse organizations" on public.organizations;

-- Também removemos policies antigas de leitura específicas, para recriar
-- de forma mais consistente e sem duplicidade desnecessária.
drop policy if exists "Owner can view own organizations" on public.organizations;
drop policy if exists "Owner can view locations" on public.locations;
drop policy if exists "Owner can view chairs" on public.chairs;
drop policy if exists "Owner can view barbers" on public.barbers;
drop policy if exists "Owner can view contracts" on public.contracts;
drop policy if exists "Owner can view payments" on public.payments;
drop policy if exists "Owners can view chair bookings" on public.chair_bookings;

drop policy if exists "Barbers can view own bookings" on public.chair_bookings;
drop policy if exists "Barbers can insert own bookings" on public.chair_bookings;
drop policy if exists "Barbers can update own bookings" on public.chair_bookings;


-- =========================================================
-- 4) Policies seguras para organizations
-- =========================================================

create policy "Users can view accessible organizations"
on public.organizations
for select
to authenticated
using (
  public.user_has_access_to_organization(id)
);

-- Mantém as policies já esperadas do owner para escrita
drop policy if exists "Owner can insert organizations" on public.organizations;
create policy "Owner can insert organizations"
on public.organizations
for insert
to authenticated
with check (owner_id = auth.uid());

drop policy if exists "Owner can update own organizations" on public.organizations;
create policy "Owner can update own organizations"
on public.organizations
for update
to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Owner can delete own organizations" on public.organizations;
create policy "Owner can delete own organizations"
on public.organizations
for delete
to authenticated
using (owner_id = auth.uid());


-- =========================================================
-- 5) Policies seguras para locations
-- =========================================================

create policy "Users can view accessible locations"
on public.locations
for select
to authenticated
using (
  public.user_has_access_to_organization(organization_id)
);

drop policy if exists "Owner can insert locations" on public.locations;
create policy "Owner can insert locations"
on public.locations
for insert
to authenticated
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can update locations" on public.locations;
create policy "Owner can update locations"
on public.locations
for update
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
)
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can delete locations" on public.locations;
create policy "Owner can delete locations"
on public.locations
for delete
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);


-- =========================================================
-- 6) Policies seguras para chairs
-- =========================================================

create policy "Users can view accessible chairs"
on public.chairs
for select
to authenticated
using (
  public.user_has_access_to_chair(id)
);

drop policy if exists "Owner can insert chairs" on public.chairs;
create policy "Owner can insert chairs"
on public.chairs
for insert
to authenticated
with check (
  location_id in (
    select l.id
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can update chairs" on public.chairs;
create policy "Owner can update chairs"
on public.chairs
for update
to authenticated
using (
  location_id in (
    select l.id
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where o.owner_id = auth.uid()
  )
)
with check (
  location_id in (
    select l.id
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can delete chairs" on public.chairs;
create policy "Owner can delete chairs"
on public.chairs
for delete
to authenticated
using (
  location_id in (
    select l.id
    from public.locations l
    join public.organizations o on o.id = l.organization_id
    where o.owner_id = auth.uid()
  )
);


-- =========================================================
-- 7) Policies seguras para barbers
-- =========================================================

create policy "Users can view accessible barbers"
on public.barbers
for select
to authenticated
using (
  public.user_has_access_to_organization(organization_id)
);

drop policy if exists "Owner can insert barbers" on public.barbers;
create policy "Owner can insert barbers"
on public.barbers
for insert
to authenticated
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can update barbers" on public.barbers;
create policy "Owner can update barbers"
on public.barbers
for update
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
)
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can delete barbers" on public.barbers;
create policy "Owner can delete barbers"
on public.barbers
for delete
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);


-- =========================================================
-- 8) Policies seguras para contracts e payments
-- =========================================================

create policy "Users can view accessible contracts"
on public.contracts
for select
to authenticated
using (
  public.user_has_access_to_organization(organization_id)
);

drop policy if exists "Owner can insert contracts" on public.contracts;
create policy "Owner can insert contracts"
on public.contracts
for insert
to authenticated
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can update contracts" on public.contracts;
create policy "Owner can update contracts"
on public.contracts
for update
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
)
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can delete contracts" on public.contracts;
create policy "Owner can delete contracts"
on public.contracts
for delete
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);

create policy "Users can view accessible payments"
on public.payments
for select
to authenticated
using (
  public.user_has_access_to_organization(organization_id)
);

drop policy if exists "Owner can insert payments" on public.payments;
create policy "Owner can insert payments"
on public.payments
for insert
to authenticated
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);

drop policy if exists "Owner can update payments" on public.payments;
create policy "Owner can update payments"
on public.payments
for update
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
)
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);


-- =========================================================
-- 9) Hardening de chair_bookings
-- =========================================================
-- Problema atual:
-- o barbeiro consegue inserir booking só validando que o profile é dele.
-- Isso não garante coerência entre:
-- - chair_id
-- - organization_id
-- - vínculo organizacional
--
-- Vamos resolver isso com:
-- - trigger de validação
-- - policies mais rígidas
-- =========================================================

create or replace function public.validate_chair_booking_tenant_consistency()
returns trigger
language plpgsql
as $$
declare
  v_current_profile_id uuid;
  v_chair_organization_id uuid;
begin
  v_current_profile_id := public.current_barber_profile_id();
  v_chair_organization_id := public.get_chair_organization_id(new.chair_id);

  if v_chair_organization_id is null then
    raise exception 'Cadeira inválida ou sem organização';
  end if;

  if new.organization_id <> v_chair_organization_id then
    raise exception 'organization_id da reserva não corresponde à organização da cadeira';
  end if;

  -- Se o usuário autenticado for o próprio barbeiro inserindo/atualizando,
  -- garantir que o booking é dele e que ele pertence à organização informada.
  if v_current_profile_id is not null then
    if new.barber_profile_id <> v_current_profile_id then
      raise exception 'O usuário só pode criar/editar reservas para o próprio perfil';
    end if;

    if not exists (
      select 1
      from public.barbers b
      where b.organization_id = new.organization_id
        and b.barber_profile_id = v_current_profile_id
    ) then
      raise exception 'O barbeiro não está vinculado a esta organização';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_chair_booking_tenant_consistency on public.chair_bookings;
create trigger trg_validate_chair_booking_tenant_consistency
before insert or update on public.chair_bookings
for each row
execute function public.validate_chair_booking_tenant_consistency();

-- Recriar policies de leitura/escrita com escopo correto

create policy "Users can view accessible chair bookings"
on public.chair_bookings
for select
to authenticated
using (
  public.user_has_access_to_organization(organization_id)
  or barber_profile_id = public.current_barber_profile_id()
);

create policy "Barbers can insert own bookings safely"
on public.chair_bookings
for insert
to authenticated
with check (
  barber_profile_id = public.current_barber_profile_id()
  and public.user_has_access_to_organization(organization_id)
  and public.get_chair_organization_id(chair_id) = organization_id
);

create policy "Barbers can update own bookings safely"
on public.chair_bookings
for update
to authenticated
using (
  barber_profile_id = public.current_barber_profile_id()
)
with check (
  barber_profile_id = public.current_barber_profile_id()
  and public.user_has_access_to_organization(organization_id)
  and public.get_chair_organization_id(chair_id) = organization_id
);

-- Opcionalmente, owner pode gerenciar bookings da própria organização
create policy "Owners can insert chair bookings"
on public.chair_bookings
for insert
to authenticated
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
  and public.get_chair_organization_id(chair_id) = organization_id
);

create policy "Owners can update chair bookings"
on public.chair_bookings
for update
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
)
with check (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
  and public.get_chair_organization_id(chair_id) = organization_id
);

create policy "Owners can delete chair bookings"
on public.chair_bookings
for delete
to authenticated
using (
  organization_id in (
    select o.id
    from public.organizations o
    where o.owner_id = auth.uid()
  )
);


-- =========================================================
-- 10) Índices úteis
-- =========================================================

create index if not exists idx_locations_organization_id
  on public.locations(organization_id);

create index if not exists idx_chairs_location_id
  on public.chairs(location_id);

create index if not exists idx_barbers_organization_id
  on public.barbers(organization_id);

create index if not exists idx_chair_bookings_organization_id
  on public.chair_bookings(organization_id);

create index if not exists idx_chair_bookings_barber_profile_id
  on public.chair_bookings(barber_profile_id);

create index if not exists idx_organizations_owner_id
  on public.organizations(owner_id);


commit;