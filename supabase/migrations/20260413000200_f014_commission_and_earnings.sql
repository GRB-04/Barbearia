-- F014 — Comissão / faturamento
-- Baseado na documentação do MVP:
-- - comissão automática por atendimento
-- - demonstrativo de ganhos por período
-- - ligação direta com check_ins

alter table public.contracts
  add column if not exists commission_type text not null default 'percentage',
  add column if not exists commission_value numeric(10,2) not null default 50.00;

alter table public.contracts
  drop constraint if exists contracts_commission_type_check;

alter table public.contracts
  add constraint contracts_commission_type_check
  check (commission_type in ('percentage', 'fixed'));

alter table public.check_ins
  add column if not exists service_amount numeric(10,2) not null default 0,
  add column if not exists commission_type text,
  add column if not exists commission_value numeric(10,2),
  add column if not exists commission_amount numeric(10,2) not null default 0;

alter table public.check_ins
  drop constraint if exists check_ins_service_amount_check;

alter table public.check_ins
  add constraint check_ins_service_amount_check
  check (service_amount >= 0);

alter table public.check_ins
  drop constraint if exists check_ins_commission_amount_check;

alter table public.check_ins
  add constraint check_ins_commission_amount_check
  check (commission_amount >= 0);

alter table public.check_ins
  drop constraint if exists check_ins_commission_type_check;

alter table public.check_ins
  add constraint check_ins_commission_type_check
  check (
    commission_type is null
    or commission_type in ('percentage', 'fixed')
  );

create index if not exists idx_check_ins_barber_profile_finished_at
  on public.check_ins (barber_profile_id, finished_at desc);

create index if not exists idx_check_ins_contract_id
  on public.check_ins (contract_id);