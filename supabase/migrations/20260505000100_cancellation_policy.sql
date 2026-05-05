-- F021 — Política de cancelamento
-- Adiciona campos de cancelamento na tabela contracts

alter table public.contracts
  add column if not exists cancelled_by uuid references auth.users(id),
  add column if not exists cancellation_reason text,
  add column if not exists cancellation_fee numeric(10,2) default 0,
  add column if not exists cancelled_at timestamptz;

-- Índice para queries de cancelamento
create index if not exists idx_contracts_cancelled_at
  on public.contracts (cancelled_at desc)
  where cancelled_at is not null;
