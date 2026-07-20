-- =============================================================================
-- TESTES DE INTEGRAÇÃO — Triggers, RLS e Constraints
-- =============================================================================
-- Rodar APÓS seed.test.sql em uma Supabase branch.
-- Cada bloco é independente e limpa após si mesmo.
--
-- Executar via Supabase Dashboard → SQL Editor, ou:
--   supabase db diff  (para inspecionar)
--   psql $DATABASE_URL -f supabase/tests/integration.sql
-- =============================================================================

-- Utilitário: assert simples
create or replace function _assert(
  label text,
  condition boolean,
  detail text default ''
) returns void as $$
begin
  if not condition then
    raise exception 'FALHOU: % — %', label, detail;
  end if;
  raise notice 'OK: %', label;
end;
$$ language plpgsql;

-- ──────────────────────────────────────────────────────────────────────────────
-- BLOCO 1 — Trigger: booking confirmada → contrato criado (auto_confirm=true)
-- ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_booking_id uuid;
  v_contract_count int;
begin
  raise notice '--- BLOCO 1: Trigger booking → contrato ---';

  -- 1a. Criar booking diretamente com status=confirmed (auto_confirm=true na org)
  insert into public.chair_bookings
    (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (
    '33333333-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    now() + interval '1 day',
    now() + interval '1 day' + interval '4 hours',
    'confirmed'
  )
  returning id into v_booking_id;

  select count(*) into v_contract_count
  from public.contracts
  where booking_id = v_booking_id and status = 'active';

  perform _assert(
    'booking confirmed → exatamente 1 contrato active',
    v_contract_count = 1,
    format('encontrados: %s', v_contract_count)
  );

  -- 1b. Cancelar a booking → contrato deve virar voided (linha mantida)
  update public.chair_bookings set status = 'cancelled' where id = v_booking_id;

  select count(*) into v_contract_count
  from public.contracts
  where booking_id = v_booking_id and status = 'voided';

  perform _assert(
    'booking cancelled → contrato voided (linha presente)',
    v_contract_count = 1,
    format('encontrados: %s', v_contract_count)
  );

  -- Cleanup
  delete from public.contracts     where booking_id = v_booking_id;
  delete from public.chair_bookings where id = v_booking_id;
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- BLOCO 2 — Booking pending NÃO cria contrato; aprovar cria
-- ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_booking_id uuid;
  v_contract_count int;
begin
  raise notice '--- BLOCO 2: Booking pending → sem contrato; approve → contrato ---';

  -- Temporariamente desabilitar auto_confirm na org
  update public.organizations
  set auto_confirm_bookings = false
  where id = '11111111-0000-0000-0000-000000000001';

  insert into public.chair_bookings
    (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (
    '33333333-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    now() + interval '2 days',
    now() + interval '2 days' + interval '4 hours',
    'pending'
  )
  returning id into v_booking_id;

  select count(*) into v_contract_count
  from public.contracts where booking_id = v_booking_id;

  perform _assert(
    'booking pending → nenhum contrato criado',
    v_contract_count = 0,
    format('encontrados: %s', v_contract_count)
  );

  -- Dono aprova
  update public.chair_bookings set status = 'confirmed' where id = v_booking_id;

  select count(*) into v_contract_count
  from public.contracts where booking_id = v_booking_id and status = 'active';

  perform _assert(
    'booking pending → confirmed → 1 contrato active',
    v_contract_count = 1,
    format('encontrados: %s', v_contract_count)
  );

  -- Cleanup
  update public.organizations set auto_confirm_bookings = true where id = '11111111-0000-0000-0000-000000000001';
  delete from public.contracts     where booking_id = v_booking_id;
  delete from public.chair_bookings where id = v_booking_id;
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- BLOCO 3 — Idempotência: confirmar duas vezes gera exatamente 1 contrato
-- ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_booking_id uuid;
  v_contract_count int;
begin
  raise notice '--- BLOCO 3: Idempotência de confirmação ---';

  insert into public.chair_bookings
    (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (
    '33333333-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    now() + interval '3 days',
    now() + interval '3 days' + interval '4 hours',
    'pending'
  )
  returning id into v_booking_id;

  -- Confirmar duas vezes
  update public.chair_bookings set status = 'confirmed' where id = v_booking_id;
  update public.chair_bookings set status = 'confirmed' where id = v_booking_id;

  select count(*) into v_contract_count
  from public.contracts where booking_id = v_booking_id;

  perform _assert(
    'confirmar 2x → exatamente 1 contrato (UNIQUE constraint em booking_id)',
    v_contract_count = 1,
    format('encontrados: %s', v_contract_count)
  );

  -- Cleanup
  delete from public.contracts     where booking_id = v_booking_id;
  delete from public.chair_bookings where id = v_booking_id;
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- BLOCO 4 — Constraint GIST: sem sobreposição por cadeira
-- ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_booking_id uuid;
  v_error_caught boolean := false;
begin
  raise notice '--- BLOCO 4: Constraint GIST — overlap por cadeira ---';

  -- Booking base
  insert into public.chair_bookings
    (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (
    '33333333-0000-0000-0000-000000000002',
    '44444444-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    '2026-08-01 09:00:00+00',
    '2026-08-01 13:00:00+00',
    'confirmed'
  )
  returning id into v_booking_id;

  -- Tentar booking sobreposta na mesma cadeira com outro barbeiro
  begin
    insert into public.chair_bookings
      (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
    values (
      '33333333-0000-0000-0000-000000000002',
      '44444444-0000-0000-0000-000000000002',
      '11111111-0000-0000-0000-000000000001',
      '2026-08-01 11:00:00+00',
      '2026-08-01 15:00:00+00',
      'confirmed'
    );
  exception when others then
    v_error_caught := true;
  end;

  perform _assert(
    'overlap por cadeira → constraint violation',
    v_error_caught = true
  );

  -- Cleanup
  delete from public.contracts     where booking_id = v_booking_id;
  delete from public.chair_bookings where id = v_booking_id;
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- BLOCO 5 — Constraint GIST: sem sobreposição por barbeiro
-- ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_booking_id uuid;
  v_error_caught boolean := false;
begin
  raise notice '--- BLOCO 5: Constraint GIST — overlap por barbeiro ---';

  insert into public.chair_bookings
    (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (
    '33333333-0000-0000-0000-000000000001',
    '44444444-0000-0000-0000-000000000001',
    '11111111-0000-0000-0000-000000000001',
    '2026-08-02 09:00:00+00',
    '2026-08-02 13:00:00+00',
    'confirmed'
  )
  returning id into v_booking_id;

  -- Mesmo barbeiro tentando outra cadeira no mesmo horário
  begin
    insert into public.chair_bookings
      (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
    values (
      '33333333-0000-0000-0000-000000000002',
      '44444444-0000-0000-0000-000000000001',
      '11111111-0000-0000-0000-000000000001',
      '2026-08-02 11:00:00+00',
      '2026-08-02 15:00:00+00',
      'confirmed'
    );
  exception when others then
    v_error_caught := true;
  end;

  perform _assert(
    'overlap por barbeiro → constraint violation',
    v_error_caught = true
  );

  -- Cleanup
  delete from public.contracts      where booking_id = v_booking_id;
  delete from public.chair_bookings  where id = v_booking_id;
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- BLOCO 6 — Override de unidade: location sobrescreve org
-- ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_effective boolean;
begin
  raise notice '--- BLOCO 6: COALESCE auto_confirm org → location ---';

  -- org=true, location=null → effective=true
  select coalesce(l.auto_confirm_bookings, o.auto_confirm_bookings)
  into v_effective
  from public.locations l
  join public.organizations o on o.id = l.organization_id
  where l.id = '22222222-0000-0000-0000-000000000001';

  perform _assert('org=true, location=null → true', v_effective = true);

  -- Setar location.auto_confirm=false → deve sobrescrever
  update public.locations set auto_confirm_bookings = false
  where id = '22222222-0000-0000-0000-000000000001';

  select coalesce(l.auto_confirm_bookings, o.auto_confirm_bookings)
  into v_effective
  from public.locations l
  join public.organizations o on o.id = l.organization_id
  where l.id = '22222222-0000-0000-0000-000000000001';

  perform _assert('org=true, location=false → false (override)', v_effective = false);

  -- Restaurar
  update public.locations set auto_confirm_bookings = null
  where id = '22222222-0000-0000-0000-000000000001';
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- BLOCO 7 — Duração mínima de 4 horas
-- ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_error_caught boolean := false;
begin
  raise notice '--- BLOCO 7: Duração mínima 4h ---';

  begin
    insert into public.chair_bookings
      (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
    values (
      '33333333-0000-0000-0000-000000000001',
      '44444444-0000-0000-0000-000000000001',
      '11111111-0000-0000-0000-000000000001',
      '2026-08-10 09:00:00+00',
      '2026-08-10 11:00:00+00',  -- apenas 2h
      'confirmed'
    );
  exception when others then
    v_error_caught := true;
  end;

  perform _assert('reserva com < 4h → constraint error', v_error_caught = true);
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- BLOCO 8 — RLS para Recepcionista
-- ──────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_recep_user_id uuid := '10000000-0000-0000-0000-000000000005';
  v_org_id uuid := '11111111-0000-0000-0000-000000000001';
  v_barber_profile_id uuid := '44444444-0000-0000-0000-000000000001';
  v_client_id uuid;
  v_checkin_id uuid;
  v_booking_id uuid;
  v_contracts_count int;
  v_clients_count int;
  v_checkins_count int;
  v_bookings_count int;
begin
  raise notice '--- BLOCO 8: RLS para Recepcionista ---';

  -- 8a. Simular login da recepcionista definindo a claim de JWT sub
  perform set_config('request.jwt.claim.sub', v_recep_user_id::text, true);

  -- Validar que helpers retornam dados corretos
  perform _assert('receptionist_organization_id', public.receptionist_organization_id() = v_org_id);
  
  -- 8b. Testar leitura de barbeiros e perfis
  select count(*) into v_bookings_count from public.organization_barbers;
  perform _assert('recepcionista pode ver roster de barbeiros da org', v_bookings_count > 0, format('encontrados: %s', v_bookings_count));

  select count(*) into v_bookings_count from public.barber_profiles;
  perform _assert('recepcionista pode ver perfis de barbeiros da org', v_bookings_count > 0, format('encontrados: %s', v_bookings_count));

  -- 8c. Inserir cliente como recepcionista (deve passar RLS com organization_id)
  insert into public.barber_clients (organization_id, barber_profile_id, full_name, phone, email)
  values (v_org_id, v_barber_profile_id, 'Cliente Recepcionista', '11999999999', 'clienterecep@gmail.com')
  returning id into v_client_id;

  select count(*) into v_clients_count from public.barber_clients where id = v_client_id;
  perform _assert('recepcionista pode inserir e ver clientes da org', v_clients_count = 1);

  -- 8d. Testar que recepcionista pode atualizar o cliente
  update public.barber_clients set full_name = 'Cliente Recepcionista Atualizado' where id = v_client_id;
  select count(*) into v_clients_count from public.barber_clients where id = v_client_id and full_name = 'Cliente Recepcionista Atualizado';
  perform _assert('recepcionista pode atualizar cliente da org', v_clients_count = 1);

  -- Desfazer simulação temporariamente para criar agendamento sob o barbeiro
  perform set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true); -- barbeiro
  insert into public.chair_bookings
    (chair_id, barber_profile_id, organization_id, start_at, end_at, status)
  values (
    '33333333-0000-0000-0000-000000000001',
    v_barber_profile_id,
    v_org_id,
    now() + interval '5 days',
    now() + interval '5 days' + interval '4 hours',
    'confirmed'
  )
  returning id into v_booking_id;

  -- Voltar a simular login da recepcionista
  perform set_config('request.jwt.claim.sub', v_recep_user_id::text, true);

  -- 8e. Testar que recepcionista consegue ver o booking e o contrato criado
  select count(*) into v_bookings_count from public.chair_bookings where id = v_booking_id;
  perform _assert('recepcionista pode ver bookings da org', v_bookings_count = 1);

  select count(*) into v_contracts_count from public.contracts where booking_id = v_booking_id;
  perform _assert('recepcionista pode ver contratos da org', v_contracts_count = 1);

  -- 8f. Registrar check-in como recepcionista para o agendamento do barbeiro
  insert into public.check_ins (organization_id, barber_profile_id, client_id, status, checked_in_at)
  values (v_org_id, v_barber_profile_id, v_client_id, 'checked_in', now())
  returning id into v_checkin_id;

  select count(*) into v_checkins_count from public.check_ins where id = v_checkin_id;
  perform _assert('recepcionista pode registrar check-in para outro barbeiro na org', v_checkins_count = 1);

  -- Cleanup do bloco 8 (como superuser / sem RLS simulado)
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.check_ins where id = v_checkin_id;
  delete from public.contracts where booking_id = v_booking_id;
  delete from public.chair_bookings where id = v_booking_id;
  delete from public.barber_clients where id = v_client_id;
end
$$;

-- ──────────────────────────────────────────────────────────────────────────────
-- Cleanup
-- ──────────────────────────────────────────────────────────────────────────────
drop function if exists _assert(text, boolean, text);

select '=== TODOS OS TESTES DE INTEGRAÇÃO CONCLUÍDOS ===' as message;
