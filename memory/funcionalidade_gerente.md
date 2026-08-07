---
name: manager-role-feature
description: "Manager role feature — scope, permissions, onboarding, portal, key files (built 2026-07-02)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2b390199-4aa4-4556-a7a0-54a56f5e6b8d
---

# Feature: Role de Gerente (implementada 2026-07-02, branch ector-julho)

**Propósito:** gerente é intermediário entre o dono e os barbeiros, responsável por UM ponto físico.

## Modelo
- Gerente = linha em `organization_barbers` com `role='manager'`, `location_id` (ponto fixo, obrigatório), `permissions` (JSONB).
- Vinculado a **um** ponto (decisão: "um ponto fixo").
- Portal próprio `/manager/*` (separado do dono e do barbeiro).

## Onboarding
- Dono adiciona gerente em **Configurações > Gerentes** (email + ponto + permissões). Cria linha `organization_barbers` role='manager', user_id=null.
- Dono copia link de convite (mesmo padrão do barbeiro: `/barber/auth?org={org_id}`).
- Gerente cria conta pelo link → `claim_barber_invitation()` vincula e **preserva** o role='manager' (fix aplicado — a função NÃO sobrescreve role/location/permissions de convites pré-existentes).
- App detecta role='manager' → redireciona para `/manager/dashboard`.

## Permissões
- **Fixas (todo gerente tem):** ver barbeiros/contratos/cadeiras do ponto; aprovar/rejeitar reservas quando `org.auto_confirm_bookings=false`.
- **Opcionais (toggle pelo dono, JSONB):** `can_manage_payments`, `can_edit_chairs`, `can_view_financials`, `can_invite_barbers`. Todas default false.
- Helper client-side: `src/lib/managerPermissions.ts` (`parseManagerPermissions`, `MANAGER_PERMISSION_LABELS`).

## Barbeiros no portal do gerente
- Gerente vê **TODOS os barbeiros da organização** (não só os do ponto) com filtro **Todos / Ativos** ("ativo" = tem reserva ou contrato no ponto do gerente). Decisão do dono: barbeiro pertence à org, não a um ponto.
- Serviço: `fetchOrgBarbersForManager(orgId, locationId)` em `src/services/managerData.ts`.

## Portal `/manager/*` (rotas)
dashboard, bookings (aprovar), barbers, contracts, chairs, payments (se can_manage_payments), financials (se can_view_financials). Layout: `src/components/ManagerLayout.tsx`.

## Arquivos-chave
- Hook: `src/hooks/useBarberProfile.tsx` expõe `isLocationManager`, `managerLocationId`, `managerPermissions`.
- Rotas/guards: `src/App.tsx` (ManagerRoutes).
- Serviço: `src/services/managerData.ts`.
- Settings do dono: `src/components/ManagerUsersSection.tsx`.
- Migrations DB: `supabase/migrations/20260702000100..000600` (schema, RLS, helpers).

**Lições de RLS desta feature:** ver [[rls-recursion-lessons]]. **Drift do banco:** ver [[tech-stack-and-canonical-db]].
