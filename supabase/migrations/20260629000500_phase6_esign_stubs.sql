-- Phase 6: e-sign preparation — stub columns only, no integration yet.
-- Dropbox Sign (or equivalent) will be wired near production.
-- These columns make the schema ready without coupling to an external service.

begin;

alter table public.contracts
  add column if not exists esign_status text
    check (esign_status in ('pending', 'sent', 'signed', 'declined', 'voided'))
    default null,
  add column if not exists esign_envelope_id text default null;

create index if not exists idx_contracts_esign_envelope_id
  on public.contracts (esign_envelope_id)
  where esign_envelope_id is not null;

commit;
