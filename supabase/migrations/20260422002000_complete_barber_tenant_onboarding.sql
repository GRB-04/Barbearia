-- =========================================================
-- COMPLETE BARBER TENANT ONBOARDING
-- =========================================================

-- 1) barbers precisa aceitar barbeiro pendente (sem login ainda)
alter table public.barbers
  alter column barber_profile_id drop not null;

alter table public.barbers
  alter column user_id drop not null;

-- 2) índices de unicidade importantes
create unique index if not exists barbers_barber_profile_id_unique
on public.barbers (barber_profile_id)
where barber_profile_id is not null;

create unique index if not exists barbers_user_id_unique
on public.barbers (user_id)
where user_id is not null;

create unique index if not exists barber_profiles_user_id_key_manual
on public.barber_profiles (user_id);

-- 3) função para o barbeiro "reivindicar" o convite pelo link da barbearia
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
  v_barber public.barbers%rowtype;
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

  update public.barbers
  set
    user_id = v_user_id,
    barber_profile_id = v_profile.id,
    full_name = coalesce(public.barbers.full_name, v_profile.full_name),
    email = coalesce(public.barbers.email, v_email),
    phone = coalesce(public.barbers.phone, v_profile.phone)
  where public.barbers.organization_id = p_organization_id
    and lower(public.barbers.email) = lower(v_email)
    and (public.barbers.user_id is null or public.barbers.user_id = v_user_id)
    and (
      public.barbers.barber_profile_id is null
      or public.barbers.barber_profile_id = v_profile.id
    )
  returning *
  into v_barber;

  if v_barber.id is null then
    raise exception 'Nenhum convite encontrado para este e-mail nesta barbearia.';
  end if;

  return jsonb_build_object(
    'barber_profile_id', v_profile.id,
    'barber_id', v_barber.id,
    'organization_id', v_barber.organization_id
  );
end;
$$;

grant execute on function public.claim_barber_invitation(uuid, text, text) to authenticated;