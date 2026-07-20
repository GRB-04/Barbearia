-- =============================================================================
-- SEED DE TESTE — Barbearia MVP
-- =============================================================================
-- Uso: rodar em uma Supabase branch (NÃO em produção)
-- Cria: 1 organização, 1 location, 2 cadeiras, 1 dono, 2 barbeiros, 1 gerente
--
-- Credenciais de teste (usar para login nos testes E2E e de integração):
--
--   DONO:     dono@gmail.com       / 123456
--   BARBEIRO: barbeiro@gmail.com   / 123456
--   BARBEIRO2:barbeiro2@gmail.com  / 123456
--   GERENTE:  gerente@gmail.com    / 123456
--
-- OBS: os usuários já devem existir em auth.users antes de rodar este seed.
-- Use o Supabase Dashboard → Authentication → Add User para criá-los, ou
-- use a Supabase CLI: supabase auth users create --email ... --password ...
-- =============================================================================

-- Limpar dados anteriores de teste (seguro porque é uma branch)
do $$
begin
  delete from public.chair_waitlist      where organization_id in (select id from public.organizations where name = 'Barbearia Teste E2E');
  delete from public.check_ins           where organization_id in (select id from public.organizations where name = 'Barbearia Teste E2E');
  delete from public.contracts           where organization_id in (select id from public.organizations where name = 'Barbearia Teste E2E');
  delete from public.chair_bookings      where organization_id in (select id from public.organizations where name = 'Barbearia Teste E2E');
  delete from public.payments            where organization_id in (select id from public.organizations where name = 'Barbearia Teste E2E');
  delete from public.chairs              where location_id in (select id from public.locations where name = 'Unidade Centro Teste');
  delete from public.locations           where organization_id in (select id from public.organizations where name = 'Barbearia Teste E2E');
  delete from public.organization_barbers where organization_id in (select id from public.organizations where name = 'Barbearia Teste E2E');
  delete from public.organizations       where name = 'Barbearia Teste E2E';
  
  -- Remove os usuários antigos do auth se existirem
  delete from auth.users where email in (
    'dono@gmail.com',
    'barbeiro@gmail.com',
    'barbeiro2@gmail.com',
    'gerente@gmail.com',
    'recepcionista@gmail.com'
  );
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- 0. CRIAÇÃO AUTOMÁTICA DE USUÁRIOS NO AUTH (idempotente)
-- ──────────────────────────────────────────────────────────────────────────────
-- Usamos extensões do postgres nativas do Supabase para encriptar a senha "TestPass123!"
insert into auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, aud, role)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'dono@gmail.com',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'barbeiro@gmail.com',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'barbeiro2@gmail.com',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000000',
    'gerente@gmail.com',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  ),
  (
    '10000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000000',
    'recepcionista@gmail.com',
    extensions.crypt('123456', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    'authenticated',
    'authenticated'
  )
on conflict (id) do nothing;

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. VARIÁVEIS (usando uma tabela temporária para compartilhar UUIDs)
-- ──────────────────────────────────────────────────────────────────────────────
create temp table _seed_ids (key text primary key, val uuid);

-- Captura user_ids recém-criados
insert into _seed_ids values
  ('owner_user_id',        '10000000-0000-0000-0000-000000000001'),
  ('barber_user_id',       '10000000-0000-0000-0000-000000000002'),
  ('barber2_user_id',      '10000000-0000-0000-0000-000000000003'),
  ('manager_user_id',      '10000000-0000-0000-0000-000000000004'),
  ('receptionist_user_id', '10000000-0000-0000-0000-000000000005');

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. ORGANIZAÇÃO
-- ──────────────────────────────────────────────────────────────────────────────
insert into public.organizations (id, name, owner_id, auto_confirm_bookings)
values (
  '11111111-0000-0000-0000-000000000001',
  'Barbearia Teste E2E',
  (select val from _seed_ids where key = 'owner_user_id'),
  true  -- confirmação instantânea por padrão
)
on conflict (id) do update set name = excluded.name;

insert into _seed_ids values ('org_id', '11111111-0000-0000-0000-000000000001');

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. UNIDADE (LOCATION)
-- ──────────────────────────────────────────────────────────────────────────────
insert into public.locations (id, organization_id, name, address, city, state, auto_confirm_bookings, operating_hours, capacity)
values (
  '22222222-0000-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000001',
  'Unidade Centro Teste',
  'Rua das Tesouras, 42',
  'São Paulo',
  'SP',
  null,  -- herda da org (auto_confirm = true)
  '{
    "monday":    {"open": true,  "start": "09:00", "end": "19:00"},
    "tuesday":   {"open": true,  "start": "09:00", "end": "19:00"},
    "wednesday": {"open": true,  "start": "09:00", "end": "19:00"},
    "thursday":  {"open": true,  "start": "09:00", "end": "19:00"},
    "friday":    {"open": true,  "start": "09:00", "end": "19:00"},
    "saturday":  {"open": true,  "start": "10:00", "end": "15:00"},
    "sunday":    {"open": false}
  }'::jsonb,
  2 -- capacidade para 2 cadeiras
)
on conflict (id) do update set name = excluded.name;

insert into _seed_ids values ('location_id', '22222222-0000-0000-0000-000000000001');

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. CADEIRAS
-- ──────────────────────────────────────────────────────────────────────────────
insert into public.chairs (id, location_id, identifier, status)
values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 'A1', 'available'),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 'A2', 'available')
on conflict (id) do update set identifier = excluded.identifier;

insert into _seed_ids values
  ('chair_a1_id', '33333333-0000-0000-0000-000000000001'),
  ('chair_a2_id', '33333333-0000-0000-0000-000000000002');

-- ──────────────────────────────────────────────────────────────────────────────
-- 5. PERFIS DE BARBEIRO (barber_profiles)
-- ──────────────────────────────────────────────────────────────────────────────
insert into public.barber_profiles (id, user_id, full_name, email, role, organization_id)
values
  (
    '44444444-0000-0000-0000-000000000001',
    (select val from _seed_ids where key = 'barber_user_id'),
    'Barbeiro Teste',
    'barbeiro@gmail.com',
    'barber',
    null  -- global (sem org fixa)
  ),
  (
    '44444444-0000-0000-0000-000000000002',
    (select val from _seed_ids where key = 'barber2_user_id'),
    'Barbeiro Dois',
    'barbeiro2@gmail.com',
    'barber',
    null
  ),
  (
    '44444444-0000-0000-0000-000000000003',
    (select val from _seed_ids where key = 'receptionist_user_id'),
    'Recepcionista Teste',
    'recepcionista@gmail.com',
    'receptionist',
    '11111111-0000-0000-0000-000000000001'
  ),
  (
    '44444444-0000-0000-0000-000000000004',
    (select val from _seed_ids where key = 'manager_user_id'),
    'Gerente Teste',
    'gerente@gmail.com',
    'manager',
    '11111111-0000-0000-0000-000000000001'
  )
on conflict (id) do update set full_name = excluded.full_name, role = excluded.role;

insert into _seed_ids values
  ('barber_profile_id',       '44444444-0000-0000-0000-000000000001'),
  ('barber2_profile_id',      '44444444-0000-0000-0000-000000000002'),
  ('receptionist_profile_id', '44444444-0000-0000-0000-000000000003'),
  ('manager_profile_id',      '44444444-0000-0000-0000-000000000004');

-- ──────────────────────────────────────────────────────────────────────────────
-- 6. ROSTER DA ORG (organization_barbers)
-- ──────────────────────────────────────────────────────────────────────────────
insert into public.organization_barbers
  (id, organization_id, user_id, barber_profile_id, full_name, email, role)
values
  (
    '55555555-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    (select val from _seed_ids where key = 'barber_user_id'),
    '44444444-0000-0000-0000-000000000001',
    'Barbeiro Teste',
    'barbeiro@gmail.com',
    'barber'
  ),
  (
    '55555555-0000-0000-0000-000000000002',
    '11111111-0000-0000-0000-000000000001',
    (select val from _seed_ids where key = 'manager_user_id'),
    '44444444-0000-0000-0000-000000000004',
    'Gerente Teste',
    'gerente@gmail.com',
    'manager'
  ),
  (
    '55555555-0000-0000-0000-000000000003',
    '11111111-0000-0000-0000-000000000001',
    (select val from _seed_ids where key = 'receptionist_user_id'),
    '44444444-0000-0000-0000-000000000003',
    'Recepcionista Teste',
    'recepcionista@gmail.com',
    'receptionist'
  )
on conflict (id) do update set role = excluded.role;

-- ──────────────────────────────────────────────────────────────────────────────
-- 7. CONFIGURAÇÃO DO GERENTE
-- ──────────────────────────────────────────────────────────────────────────────
update public.organization_barbers
set
  location_id = '22222222-0000-0000-0000-000000000001',
  permissions = '{
    "can_manage_payments": true,
    "can_edit_chairs": true,
    "can_view_financials": true,
    "can_invite_barbers": false
  }'::jsonb
where id = '55555555-0000-0000-0000-000000000002';

-- Limpar tabela temporária
drop table _seed_ids;

-- ──────────────────────────────────────────────────────────────────────────────
-- Verificação rápida
-- ──────────────────────────────────────────────────────────────────────────────
select
  'Organização'     as tipo, count(*) as qtd from public.organizations    where id = '11111111-0000-0000-0000-000000000001'
union all select
  'Location',       count(*)          from public.locations               where id = '22222222-0000-0000-0000-000000000001'
union all select
  'Cadeiras',       count(*)          from public.chairs                  where location_id = '22222222-0000-0000-0000-000000000001'
union all select
  'Barber Profiles',count(*)          from public.barber_profiles         where id in ('44444444-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000002')
union all select
  'Org Barbers',    count(*)          from public.organization_barbers    where organization_id = '11111111-0000-0000-0000-000000000001';
