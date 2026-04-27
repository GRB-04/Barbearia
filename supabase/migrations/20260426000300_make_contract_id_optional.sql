-- Tornar contract_id opcional na tabela de payments, pois agora usamos booking_id para reservas flexíveis
alter table public.payments 
  alter column contract_id drop not null;

-- Garantir que pelo menos um dos dois (contract_id ou booking_id) esteja presente
-- (Opcional, mas boa prática)
-- alter table public.payments 
--   add constraint payments_id_presence_check 
--   check (contract_id is not null or booking_id is not null);
