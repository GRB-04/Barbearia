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

  -- 2) Tenta atualizar um convite existente (barbers)
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

  -- 3) Se não existia convite, AUTO-CADASTRA o barbeiro (aceitando o link genérico)
  if v_barber.id is null then
    insert into public.barbers (
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

  return jsonb_build_object(
    'barber_profile_id', v_profile.id,
    'barber_id', v_barber.id,
    'organization_id', v_barber.organization_id
  );
end;
$$;
