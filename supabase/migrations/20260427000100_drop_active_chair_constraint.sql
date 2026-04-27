-- Remover a restrição que impede múltiplos contratos ativos em dias diferentes para a mesma cadeira
DROP INDEX IF EXISTS ux_contracts_one_active_per_chair;
DROP INDEX IF EXISTS ux_contracts_one_active_per_barber;
