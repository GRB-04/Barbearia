-- O trigger trg_booking_voided_void_contract (20260629000400) seta contracts.status='voided',
-- mas o valor nunca foi adicionado ao enum contract_status ({pending,active,ended,cancelled}).
-- Efeito em produção: cancelar/rejeitar booking COM contrato falha com invalid input value —
-- o que também bloquearia a promoção da fila de espera (trigger roda no mesmo UPDATE).
-- ADD VALUE em migration isolada (restrição de uso na mesma transação).
alter type public.contract_status add value if not exists 'voided';
