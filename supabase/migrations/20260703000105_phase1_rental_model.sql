begin;

-- ============================================================
-- 1) ENUM VALUES
-- Adiciona os estados voided (reserva cancelada/rejeitada) 
-- e fulfilled (reserva concluída) ao enum contract_status
-- ============================================================
alter type public.contract_status add value if not exists 'voided';
alter type public.contract_status add value if not exists 'fulfilled';


-- ============================================================
-- 2) LIMPEZA DE CONTRATOS LEGADOS
-- ============================================================
truncate table public.contracts cascade;


-- ============================================================
-- 3) REESTRUTURAÇÃO DAS COLUNAS DE CONTRACTS
-- ============================================================
alter table public.contracts drop column if exists barber_id cascade;

alter table public.contracts 
  add column if not exists booking_id uuid unique not null references public.chair_bookings(id) on delete cascade,
  add column if not exists barber_profile_id uuid not null references public.barber_profiles(id) on delete cascade;


-- ============================================================
-- 4) ATUALIZAÇÃO DOS ÍNDICES
-- ============================================================
drop index if exists public.idx_contracts_barber_id;

create index if not exists idx_contracts_booking_id 
  on public.contracts (booking_id);

create index if not exists idx_contracts_barber_profile_id 
  on public.contracts (barber_profile_id);


-- ============================================================
-- 5) TRIGGER DE AUTOMAÇÃO DO CICLO DE VIDA DO CONTRATO
-- ============================================================
create or replace function public.sync_booking_to_contract()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract_id uuid;
  v_minutes_since_creation integer;
  v_cancellation_fee numeric := 0;
begin
  -- Se a reserva foi confirmada (pode ser insert direto ou update)
  if new.status = 'confirmed' then
    select id into v_contract_id from public.contracts where booking_id = new.id;
    
    if v_contract_id is not null then
      update public.contracts
      set status = 'active'
      where id = v_contract_id;
    else
      insert into public.contracts (
        organization_id,
        booking_id,
        barber_profile_id,
        chair_id,
        start_date,
        end_date,
        start_at,
        end_at,
        price,
        billing_cycle,
        status,
        notes
      ) values (
        new.organization_id,
        new.id,
        new.barber_profile_id,
        new.chair_id,
        new.start_at::date,
        new.end_at::date,
        new.start_at,
        new.end_at,
        new.price,
        'daily',
        'active',
        new.notes
      );
    end if;
  end if;

  -- Se a reserva foi cancelada (deve atualizar o contrato se ele existir)
  if new.status = 'cancelled' then
    select 
      extract(epoch from (now() - created_at))/60
    into v_minutes_since_creation
    from public.contracts
    where booking_id = new.id;

    if v_minutes_since_creation is not null and v_minutes_since_creation > 10 then
      v_cancellation_fee := new.price * 0.5;
    end if;

    update public.contracts
    set 
      status = 'voided',
      cancelled_by = auth.uid(),
      cancelled_at = now(),
      cancellation_fee = v_cancellation_fee,
      cancellation_reason = 'Cancelado pelo barbeiro via portal'
    where booking_id = new.id;
  end if;

  -- Se a reserva foi concluída
  if new.status = 'completed' then
    update public.contracts
    set status = 'fulfilled'
    where booking_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_booking_to_contract on public.chair_bookings;

create trigger trg_sync_booking_to_contract
after insert or update of status on public.chair_bookings
for each row
execute function public.sync_booking_to_contract();


-- ============================================================
-- 6) POLÍTICAS DE RLS DE CONTRACTS
-- Garantir que barbeiros consigam ler seus próprios contratos
-- ============================================================
drop policy if exists "contracts_select_owner_only" on public.contracts;
drop policy if exists "contracts_select_secure" on public.contracts;

create policy "contracts_select_secure"
on public.contracts
for select
to authenticated
using (
  exists (
    select 1
    from public.organizations o
    where o.id = contracts.organization_id
      and o.owner_id = auth.uid()
  )
  or contracts.barber_profile_id = public.current_barber_profile_id()
);

commit;
