-- Manager role: location binding, permissions, invitation fix, RLS
begin;

-- 1) Colunas novas em organization_barbers
alter table public.organization_barbers
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists permissions jsonb not null default '{}'::jsonb;

create index if not exists idx_organization_barbers_location_id
  on public.organization_barbers (location_id);

-- 2) Helper: o usuário autenticado é gerente deste location?
create or replace function public.is_location_manager(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_barbers ob
    where ob.user_id = auth.uid()
      and ob.role = 'manager'
      and ob.location_id = p_location_id
  );
$$;

grant execute on function public.is_location_manager(uuid) to authenticated;

-- Helper: retorna o location_id gerenciado pelo usuário (null se não é gerente)
create or replace function public.managed_location_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ob.location_id
  from public.organization_barbers ob
  where ob.user_id = auth.uid()
    and ob.role = 'manager'
    and ob.location_id is not null
  limit 1;
$$;

grant execute on function public.managed_location_id() to authenticated;

-- Helper: checa permissão opcional do gerente
create or replace function public.manager_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (ob.permissions ->> p_permission)::boolean
      from public.organization_barbers ob
      where ob.user_id = auth.uid()
        and ob.role = 'manager'
      limit 1
    ),
    false
  );
$$;

grant execute on function public.manager_has_permission(text) to authenticated;

-- 3) claim_barber_invitation: preservar role pré-existente (manager)
create or replace function public.claim_barber_invitation(
  p_organization_id uuid,
  p_full_name text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_profile public.barber_profiles%rowtype;
  v_barber public.organization_barbers%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_organization_id is null then
    raise exception 'Organização inválida.';
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null then
    raise exception 'Usuário sem e-mail.';
  end if;

  v_name := coalesce(nullif(trim(p_full_name), ''), split_part(v_email, '@', 1));

  -- 1) Atualiza ou cria o barber_profile
  insert into public.barber_profiles (
    user_id,
    full_name,
    phone,
    email,
    organization_id
  )
  values (
    v_user_id,
    v_name,
    nullif(trim(p_phone), ''),
    v_email,
    p_organization_id
  )
  on conflict (user_id)
  do update set
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, public.barber_profiles.phone),
    email = excluded.email,
    organization_id = coalesce(public.barber_profiles.organization_id, excluded.organization_id)
  returning *
  into v_profile;

  -- 2) Tenta atualizar um convite existente (organization_barbers)
  --    IMPORTANTE: NÃO altera role/location_id/permissions — preserva o que o dono configurou.
  update public.organization_barbers
  set
    user_id = v_user_id,
    barber_profile_id = v_profile.id,
    full_name = coalesce(public.organization_barbers.full_name, v_profile.full_name),
    email = coalesce(public.organization_barbers.email, v_email),
    phone = coalesce(public.organization_barbers.phone, v_profile.phone)
  where public.organization_barbers.organization_id = p_organization_id
    and lower(public.organization_barbers.email) = lower(v_email)
    and (public.organization_barbers.user_id is null or public.organization_barbers.user_id = v_user_id)
    and (
      public.organization_barbers.barber_profile_id is null
      or public.organization_barbers.barber_profile_id = v_profile.id
    )
  returning *
  into v_barber;

  -- 3) Se não existia convite, AUTO-CADASTRA como barbeiro comum
  if v_barber.id is null then
    insert into public.organization_barbers (
      organization_id,
      barber_profile_id,
      user_id,
      full_name,
      email,
      phone,
      role
    ) values (
      p_organization_id,
      v_profile.id,
      v_user_id,
      coalesce(v_profile.full_name, v_name),
      v_email,
      v_profile.phone,
      'barber'
    ) returning * into v_barber;
  end if;

  -- 4) Sincroniza role do profile com o roster (manager fica manager)
  update public.barber_profiles
  set role = v_barber.role
  where id = v_profile.id
    and role is distinct from v_barber.role;

  return jsonb_build_object(
    'barber_profile_id', v_profile.id,
    'barber_id', v_barber.id,
    'organization_id', v_barber.organization_id,
    'role', v_barber.role
  );
end;
$$;

grant execute on function public.claim_barber_invitation(uuid, text, text) to authenticated;

-- 4) RLS policies para manager (escopadas ao location gerenciado)

-- chair_bookings: manager vê e atualiza status das reservas do seu ponto
drop policy if exists "manager_select_location_bookings" on public.chair_bookings;
create policy "manager_select_location_bookings"
  on public.chair_bookings for select to authenticated
  using (
    chair_id in (
      select c.id from public.chairs c
      where c.location_id = public.managed_location_id()
    )
  );

drop policy if exists "manager_update_location_bookings" on public.chair_bookings;
create policy "manager_update_location_bookings"
  on public.chair_bookings for update to authenticated
  using (
    chair_id in (
      select c.id from public.chairs c
      where c.location_id = public.managed_location_id()
    )
  )
  with check (
    chair_id in (
      select c.id from public.chairs c
      where c.location_id = public.managed_location_id()
    )
  );

-- contracts: manager vê contratos do seu ponto
drop policy if exists "manager_select_location_contracts" on public.contracts;
create policy "manager_select_location_contracts"
  on public.contracts for select to authenticated
  using (
    chair_id in (
      select c.id from public.chairs c
      where c.location_id = public.managed_location_id()
    )
  );

-- chairs: manager vê cadeiras do ponto; edita só com can_edit_chairs
drop policy if exists "manager_select_location_chairs" on public.chairs;
create policy "manager_select_location_chairs"
  on public.chairs for select to authenticated
  using (location_id = public.managed_location_id());

drop policy if exists "manager_update_location_chairs" on public.chairs;
create policy "manager_update_location_chairs"
  on public.chairs for update to authenticated
  using (
    location_id = public.managed_location_id()
    and public.manager_has_permission('can_edit_chairs')
  )
  with check (
    location_id = public.managed_location_id()
    and public.manager_has_permission('can_edit_chairs')
  );

drop policy if exists "manager_insert_location_chairs" on public.chairs;
create policy "manager_insert_location_chairs"
  on public.chairs for insert to authenticated
  with check (
    location_id = public.managed_location_id()
    and public.manager_has_permission('can_edit_chairs')
  );

-- locations: manager vê o próprio ponto
drop policy if exists "manager_select_own_location" on public.locations;
create policy "manager_select_own_location"
  on public.locations for select to authenticated
  using (id = public.managed_location_id());

-- organization_barbers: manager vê o roster da sua organização
-- (necessário para listar barbeiros do ponto e para o próprio login do gerente)
drop policy if exists "manager_select_org_roster" on public.organization_barbers;
create policy "manager_select_org_roster"
  on public.organization_barbers for select to authenticated
  using (
    organization_id in (
      select ob.organization_id from public.organization_barbers ob
      where ob.user_id = auth.uid() and ob.role = 'manager'
    )
  );

-- barber_profiles: manager vê perfis dos barbeiros do roster da org
drop policy if exists "manager_select_org_barber_profiles" on public.barber_profiles;
create policy "manager_select_org_barber_profiles"
  on public.barber_profiles for select to authenticated
  using (
    id in (
      select ob.barber_profile_id from public.organization_barbers ob
      where ob.organization_id in (
        select ob2.organization_id from public.organization_barbers ob2
        where ob2.user_id = auth.uid() and ob2.role = 'manager'
      )
    )
  );

-- payments: manager com can_manage_payments vê e atualiza pagamentos das reservas do ponto
drop policy if exists "manager_select_location_payments" on public.payments;
create policy "manager_select_location_payments"
  on public.payments for select to authenticated
  using (
    public.manager_has_permission('can_manage_payments')
    and booking_id in (
      select cb.id from public.chair_bookings cb
      join public.chairs c on c.id = cb.chair_id
      where c.location_id = public.managed_location_id()
    )
  );

drop policy if exists "manager_update_location_payments" on public.payments;
create policy "manager_update_location_payments"
  on public.payments for update to authenticated
  using (
    public.manager_has_permission('can_manage_payments')
    and booking_id in (
      select cb.id from public.chair_bookings cb
      join public.chairs c on c.id = cb.chair_id
      where c.location_id = public.managed_location_id()
    )
  )
  with check (
    public.manager_has_permission('can_manage_payments')
    and booking_id in (
      select cb.id from public.chair_bookings cb
      join public.chairs c on c.id = cb.chair_id
      where c.location_id = public.managed_location_id()
    )
  );

-- organization_barbers: owner pode INSERT/UPDATE/DELETE gerentes (já coberto por policies de owner existentes;
-- se não houver, as policies de owner atuais em organization_barbers permanecem a fonte de escrita)

commit;
