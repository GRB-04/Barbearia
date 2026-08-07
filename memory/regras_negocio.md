---
name: business-rules
description: "Core business rules — booking, approval, contracts, capacity, roles/permissions"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2b390199-4aa4-4556-a7a0-54a56f5e6b8d
---

# Regras de negócio — BarberHouse

## Reserva de cadeira (chair_bookings)
- Barbeiro explora cadeiras disponíveis (view `vw_public_chair_explore`) e reserva.
- Restrições: mínimo 4h, mesmo dia, dentro do `operating_hours` (JSONB) da location. GIST indexes impedem overlap na mesma cadeira e double-booking do mesmo barbeiro.
- Status: `pending` → `confirmed` / `rejected` / `cancelled` / `completed` (enum `chair_booking_status`).

## Aprovação de reserva (auto-confirm)
- Config em nível de **organização**: `organizations.auto_confirm_bookings` (boolean).
  - **true** → reserva vira `confirmed` automaticamente, sem aprovação.
  - **false** → reserva fica `pending`; **dono OU gerente do ponto** aprova/rejeita.
- Existe também `locations.auto_confirm_bookings` (nullable) — resolução legada via COALESCE(location, org). O modelo pretendido é a config em nível de org.

## Contrato (contracts)
- Ao confirmar a reserva, um TRIGGER cria 1 contrato (1:1 com booking). Triggers: `trg_booking_confirmed_create_contract` (UPDATE→confirmed) e `trg_booking_insert_confirmed_create_contract` (INSERT confirmed).
- Contrato criado com `start_date`/`end_date` derivados de `start_at`/`end_at`, `price=0` e `billing_cycle=monthly` (DEFAULTS — pricing real ainda NÃO implementado).
- `contracts.barber_profile_id` referencia `barber_profiles.id` (NÃO existe `contracts.barber_id`).

## Capacidade de ponto
- `locations.capacity` deve estar entre **1 e 50** (constraint `locations_capacity_check`). Era 1–5, ampliado para 50 em 2026-07-02.

## Papéis (enum app_role): owner | manager | receptionist | barber
- Papel fica em `organization_barbers.role` (fonte de verdade do vínculo) e sincroniza para `barber_profiles.role`.
- **owner**: dono da org (`organizations.owner_id`). Vê tudo da org.
- **barber**: aluga cadeiras. Vê só o próprio.
- **manager**: intermediário de UM ponto — ver [[manager-role-feature]].
- **receptionist**: existe no enum, uso limitado (check-in/clientes).

## Pagamentos
- SIMULADOS (mock). `payments` liga a `booking_id`. Método enum: pix | card | cash. Status: pending | paid | overdue.
- Gerente com `can_manage_payments` registra recebimento manual (marca paid). Não há gateway real ainda.

## Fila de espera de cadeira (chair_waitlist) — 2026-07-03
- Barbeiro entra na fila de cadeira+período OCUPADO (exige conflito real; sem conflito → reserva direto). 1 entrada ativa por barbeiro+cadeira. Status: `waiting → hold → converted/expired/cancelled`.
- Booking cancelado/rejeitado → trigger promove entrada mais antiga com período totalmente livre para `hold` (exclusivo, prazo = `organizations.waitlist_hold_minutes`, default 60, editável em Settings, check 5–1440) + notificação in-app.
- Hold ativo bloqueia booking de terceiros no período (trigger BEFORE INSERT). Dono do hold reserva pelo fluxo normal → `converted`.
- Expiração: pg_cron a cada 5 min (`expire_waitlist_entries`); hold vencido/entrada no passado → `expired`, promove próximo. Promoção serializada por advisory lock por cadeira.
- Dono/gerente: visão read-only da fila por ponto. Barbeiro só cancela a própria entrada (colunas congeladas no cancel).
- Enums corrigidos junto: `chair_booking_status` ganhou `rejected`; `contract_status` ganhou `voided` (cancelamento de reserva confirmada com contrato falhava em produção).

## Isolamento (RLS)
- Dono vê dados da própria org. Barbeiro vê o próprio. Gerente é escopado ao ponto (reservas/contratos/cadeiras/pagamentos) mas vê barbeiros da **org inteira** (decisão do dono). Ver [[rls-recursion-lessons]].
