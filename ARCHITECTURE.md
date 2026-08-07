# ARCHITECTURE.md — Barbearia

> **Leia este arquivo antes de fazer qualquer alteração no banco ou no frontend.**
> Última atualização: 03/07/2026 (Fase 0 - Melhorias Frontend)

---

## Regra de ouro: Tabelas Canônicas

| Conceito | Tabela canônica | Descrição |
|----------|----------------|-----------|
| **Um barbeiro** | `barber_profiles` | Conta global de login. Uma por pessoa, independente de organização. |
| **Um aluguel** | `chair_bookings` | Fonte da verdade de qualquer ocupação de cadeira. |
| **Um contrato** | `contracts` | Filho 1:1 de um aluguel. Gerado automaticamente ao confirmar um booking. |
| **Um pagamento** | `payments` | Pix/boleto para cobrança automatizada dos alugueis de cadeira. |
| **Notificação** | `notifications` | Notificações em tempo real para avisos e alertas do sistema. |

---

## `barber_profiles` — o barbeiro como pessoa

- **O que é:** Conta de usuário do barbeiro. Uma por pessoa física no sistema inteiro.
- **Tem login?** Sim — vinculada a `auth.users` via `user_id`.
- **`organization_id`:** Nullable. `NULL` = barbeiro autônomo sem vínculo formal. Preenchido = vínculo com a organização onde foi convidado.
- **Quem cria:** O próprio barbeiro ao se cadastrar via link de convite (`claim_barber_invitation()`).

---

## `organization_barbers` — o roster de uma organização

- **O que é:** Registro de que "esse barbeiro foi convidado/adicionado a essa barbearia". É um roster por organização, **não** uma lista global de barbeiros.
- **Tem login?** Não necessariamente — o dono cria a linha **antes** do barbeiro se cadastrar.
- **Relação com `barber_profiles`:** Após o barbeiro aceitar o convite, a coluna `barber_profile_id` é preenchida (via `claim_barber_invitation()`).
- **Quem cria:** O dono da organização, ao adicionar um barbeiro ao roster.

### ⚠️ Não confundir

```
organization_barbers ≠ "todos os barbeiros do sistema"
barber_profiles      = "todos os barbeiros do sistema"

organization_barbers = "matrícula/convite por organização"
```

---

## `chair_bookings` — o aluguel

- **O que é:** A reserva de uma cadeira por um barbeiro. É a **espinha dorsal** do fluxo de aluguel.
- **Quem cria:** O barbeiro (self-service) ao reservar uma cadeira na página Explore.
- **Status possíveis:** `pending` → `confirmed` → `completed` | `cancelled` | `rejected`
- **Chave de isolamento:** `organization_id` da cadeira, não da organização do barbeiro.

---

## `payments` — cobrança de aluguéis

- **O que é:** Transação financeira Pix/boleto para cobrança automatizada dos bookings de cadeira.
- **Quem cria:** O sistema cria um pagamento Pix no estado `pending` com prazo de expiração de 5 minutos assim que a reserva (`chair_booking`) é solicitada.
- **Como é confirmado:** O barbeiro simula o pagamento Pix chamando `simulatePaymentConfirmation()`, que altera o status do pagamento para `paid` e, via trigger/webhook, atualiza a reserva para `confirmed` e gera o respectivo contrato.

---

## `contracts` — o contrato (filho de um aluguel)

- **O que é:** Documento legal derivado de um booking confirmado. Relação 1:1 com `chair_bookings`.
- **Quando é criado:** Automaticamente por trigger quando o booking muda para `confirmed`.
- **Quando é anulado:** Automaticamente por trigger quando o booking é `cancelled` ou `rejected`. O status muda para `voided` — a linha **nunca é deletada** (é registro legal).
- **`booking_id`:** FK única para `chair_bookings.id`. É o vínculo canônico.

---

## `notifications` — alertas em tempo real

- **O que é:** Tabela de mensagens para os usuários (alertas de check-in, novos contratos, avisos).
- **Tempo Real:** O componente `NotificationBell.tsx` escuta as mudanças via canal de Postgres do Supabase (`supabase.channel()`) filtrado por `user_id`.

---

## Fluxo de onboarding do barbeiro

```
Dono adiciona barbeiro ao roster
        ↓
  organization_barbers (sem login, sem barber_profile_id)
        ↓
Dono envia link de convite (/barber/auth?org=<uuid>)
        ↓
Barbeiro se cadastra (email + senha)
        ↓
  auth.users criado
        ↓
App chama claim_barber_invitation(organization_id)
        ↓
  barber_profiles criado (user_id preenchido)
  organization_barbers atualizado (barber_profile_id preenchido)
```

---

## Dois apps, um só codebase

- Portal do dono/admin: rotas em `/*`
- Portal do barbeiro: rotas em `/barber/*`

Os dois falam direto com o Supabase (PostgreSQL + Auth + RLS). Não existe servidor de API próprio. A lógica de query fica em `src/services/*.ts`.

---

## Stack

- React 18 + TypeScript + Vite
- Tailwind + shadcn/ui
- React Router + React Query
- Supabase (PostgreSQL + Auth + RLS)

---

## Convenções de nomenclatura

| Padrão | Exemplo |
|--------|---------|
| Timestamps sempre `timestamptz` | `start_at`, `end_at` |
| IDs sempre UUID | `id uuid DEFAULT gen_random_uuid()` |
| Nomes de tabela em `snake_case` plural | `organization_barbers`, `chair_bookings`, `payments` |
| Nomes de policy RLS descritivos | `org_barbers_select`, `org_barbers_insert` |

---

## O que NÃO fazer

- ❌ Criar um aluguel fora de `chair_bookings` (ex.: direto em `contracts`)
- ❌ Usar `organization_barbers.id` como referência de "o barbeiro" em bookings — use `barber_profiles.id`
- ❌ Deletar contratos — mude o status para `voided`
- ❌ Assumir que `barber_profiles.organization_id` is NOT NULL — é nullable por design
- ❌ Fazer pooling para notificações — use a subscription realtime do Supabase
