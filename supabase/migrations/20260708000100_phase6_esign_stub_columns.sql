-- Fase 6 — Hardening: colunas stub de assinatura eletrônica em contracts
-- A integração real com Dropbox Sign está prevista perto da produção.
-- Por ora, apenas adicionamos as colunas para não precisar de schema change depois.

alter table public.contracts
  add column if not exists esign_status text,
  add column if not exists esign_envelope_id text;

comment on column public.contracts.esign_status is
  'Stub para integração futura com Dropbox Sign. Valores esperados: null | pending | sent | signed | voided';

comment on column public.contracts.esign_envelope_id is
  'Stub para integração futura com Dropbox Sign. Armazenará o envelope ID retornado pela API.';
