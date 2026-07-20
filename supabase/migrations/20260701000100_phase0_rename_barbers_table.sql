begin;

-- ============================================================
-- FASE 0 — Renomear tabela `barbers` → `organization_barbers`
--
-- O que este arquivo faz:
--   1. Renomeia a tabela
--   2. Renomeia os índices para manter nomenclatura consistente
--   3. Dropa e recria todas as policies RLS com a nova tabela
--   4. Recria claim_barber_invitation() com nova referência
--   5. Recria bind_barber_profile_to_org() com nova referência
--
-- O que NÃO faz (intencional):
--   - NÃO toca em contracts.barber_id (Fase 1)
--   - NÃO altera nenhuma lógica de negócio
-- ============================================================


-- ============================================================
-- 1) RENAME DA TABELA
-- ============================================================
alter table public.barbers rename to organization_barbers;


-- ============================================================
-- 2) RENOMEAR ÍNDICES (para manter coerência de nomenclatura)
-- ============================================================
alter index if exists idx_barbers_organization_id
  rename to idx_organization_barbers_organization_id;

alter index if exists idx_barbers_barber_profile_id
  rename to idx_organization_barbers_barber_profile_id;

alter index if exists idx_barbers_email_lower
  rename to idx_organization_barbers_email_lower;

-- Outros índices criados em migrations anteriores com nome antigo:
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'barbers_barber_profile_id_fkey'
  ) then
    alter index public.barbers_barber_profile_id_fkey
      rename to organization_barbers_barber_profile_id_fkey;
  end if;
end
$$;


-- ============================================================
-- 3) RECRIAR POLICIES RLS
--
-- A estratégia: dropar qualquer policy existente com qualquer
-- nome conhecido que referencie a tabela (o rename preserva as
-- policies, mas vamos limpá-las e recriar com nomes claros
-- para remover qualquer referência interna ao nome antigo).
-- ============================================================

-- Drop de todas as policies conhecidas da antiga tabela `barbers`
-- (após o rename elas ainda existem com referência à nova tabela)
drop policy if exists "Owner can view barbers"            on public.organization_barbers;
drop policy if exists "Owner can insert barbers"          on public.organization_barbers;
drop policy if exists "Owner can update barbers"          on public.organization_barbers;
drop policy if exists "Owner can delete barbers"          on public.organization_barbers;
drop policy if exists "Users can view accessible barbers" on public.organization_barbers;
drop policy if exists "barbers_select_secure"             on public.organization_barbers;
drop policy if exists "barbers_insert_owner_only"         on public.organization_barbers;
drop policy if exists "barbers_update_owner_only"         on public.organization_barbers;
drop policy if exists "barbers_delete_owner_only"         on public.organization_barbers;
drop policy if exists "barbers_select_safe"               on public.organization_barbers;

-- Recriar com nomes que refletem o novo nome da tabela
-- SELECT: owner vê todos da própria org; barbeiro vê o próprio registro
create policy "org_barbers_select"
on public.organization_barbers
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = organization_barbers.organization_id
      and o.owner_id = auth.uid()
  )
  or organization_barbers.barber_profile_id = public.current_barber_profile_id()
);

-- INSERT: somente owner pode adicionar ao roster
create policy "org_barbers_insert"
on public.organization_barbers
for insert
to authenticated
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = organization_barbers.organization_id
      and o.owner_id = auth.uid()
  )
);

-- UPDATE: somente owner pode editar
create policy "org_barbers_update"
on public.organization_barbers
for update
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = organization_barbers.organization_id
      and o.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.organizations o
    where o.id = organization_barbers.organization_id
      and o.owner_id = auth.uid()
  )
);

-- DELETE: somente owner pode remover do roster
create policy "org_barbers_delete"
on public.organization_barbers
for delete
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = organization_barbers.organization_id
      and o.owner_id = auth.uid()
  )
);


-- ============================================================
-- 4) RECRIAR claim_barber_invitation()
--    Atualiza referências: public.barbers → public.organization_barbers
-- ============================================================
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
  v_org_barber public.organization_barbers%rowtype;
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
  into v_org_barber;

  -- 3) Se não existia convite, AUTO-CADASTRA o barbeiro (aceitando o link genérico)
  if v_org_barber.id is null then
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
    ) returning * into v_org_barber;
  end if;

  return jsonb_build_object(
    'barber_profile_id', v_profile.id,
    'barber_id', v_org_barber.id,
    'organization_id', v_org_barber.organization_id
  );
end;
$$;

grant execute on function public.claim_barber_invitation(uuid, text, text) to authenticated;


-- ============================================================
-- 5) RECRIAR bind_barber_profile_to_org()
--    Atualiza referências: public.barbers → public.organization_barbers
-- ============================================================
create or replace function public.bind_barber_profile_to_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_barber_id uuid;
  v_org_id        uuid;
  v_role          public.app_role;
begin
  if new.email is null then
    return new;
  end if;

  select ob.id, ob.organization_id, ob.role
    into v_org_barber_id, v_org_id, v_role
  from public.organization_barbers ob
  where ob.email is not null
    and lower(trim(ob.email)) = lower(trim(new.email))
  order by ob.created_at asc
  limit 1;

  if v_org_id is not null then
    new.organization_id := v_org_id;
    new.role := coalesce(v_role, 'barber');
  end if;

  if v_org_barber_id is not null then
    update public.organization_barbers
    set barber_profile_id = new.id
    where id = v_org_barber_id
      and (barber_profile_id is distinct from new.id);
  end if;

  return new;
end;
$$;

-- Recriar trigger
drop trigger if exists trg_bind_barber_profile_to_org on public.barber_profiles;

create trigger trg_bind_barber_profile_to_org
before insert on public.barber_profiles
for each row
execute function public.bind_barber_profile_to_org();


-- ============================================================
-- 6) ATUALIZAR função user_has_access_to_organization (se existir)
--    Esta função foi criada e depois removida em migrations anteriores,
--    mas caso esteja viva em alguma versão do banco, garantir consistência.
-- ============================================================
-- (Não há ação necessária: a função foi dropada em 20260407000800
--  e a versão atual não a usa. Deixado como comentário para rastreabilidade.)


commit;
