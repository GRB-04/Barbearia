# Spec — Fila de espera de cadeira (chair waitlist)

**Data:** 2026-07-03
**Status:** Aprovado (design), aguardando plano de implementação
**Item do roadmap:** #10 (memory/funcionalidade_futura.md)

## Objetivo

Barbeiro quer uma cadeira em um período que já está reservado. Em vez de desistir, entra numa fila de espera para aquela cadeira+período. Quando a reserva conflitante é cancelada/rejeitada e o período fica livre, o primeiro da fila recebe um **hold exclusivo com prazo** (configurável na organização, default 60 min) para confirmar a reserva antes que outros possam pegar o slot.

## Decisões de escopo (fechadas com o usuário)

1. **Fila por cadeira + período específico** — não por cadeira genérica nem por ponto.
2. **Hold com prazo** — primeiro da fila ganha exclusividade temporária; não confirmou → passa ao próximo.
3. **Prazo do hold: 60 minutos default, editável nas configurações da organização.**
4. **Notificação só in-app** por enquanto (tabela `notifications` existente). Push/email fica para o item #11 do roadmap.
5. **Visibilidade:** barbeiro entra/sai da fila; dono e gerente do ponto **veem** a fila (read-only, sinal de demanda reprimida). Sem gestão manual da fila no MVP.

## Abordagem escolhida

**DB-centric com triggers (Abordagem A).** Promoção e enforcement acontecem no banco (PL/pgSQL), cobrindo qualquer caminho de cancelamento (app, SQL, admin futuro). Consistente com o padrão existente (contrato criado via trigger). Expiração via pg_cron.

Alternativas descartadas: app-centric (perde cancelamentos fora do app, race conditions) e edge function orientada a eventos (overkill enquanto notificação é só in-app).

## Modelo de dados

### Coluna nova em `organizations`
```sql
waitlist_hold_minutes int NOT NULL DEFAULT 60
  CHECK (waitlist_hold_minutes BETWEEN 5 AND 1440)
```

### Enum novo
```sql
CREATE TYPE waitlist_status AS ENUM
  ('waiting', 'hold', 'converted', 'expired', 'cancelled');
```

### Tabela nova `chair_waitlist`
| Coluna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | default gen_random_uuid() |
| `chair_id` | uuid FK → chairs | |
| `barber_profile_id` | uuid FK → barber_profiles | |
| `location_id` | uuid FK → locations | denormalizado (RLS do gerente sem join recursivo) |
| `organization_id` | uuid FK → organizations | denormalizado (RLS do dono) |
| `desired_start_at` | timestamptz | |
| `desired_end_at` | timestamptz | CHECK: end > start, mínimo 4h, mesmo dia (espelha regra de `chair_bookings`) |
| `status` | waitlist_status | default 'waiting' |
| `hold_expires_at` | timestamptz NULL | preenchido só em status 'hold' |
| `notified_at` | timestamptz NULL | |
| `converted_booking_id` | uuid FK → chair_bookings NULL | preenchido em 'converted' |
| `created_at` | timestamptz | default now(); define ordem da fila |

**Unique parcial:** 1 entrada ativa por barbeiro+cadeira:
```sql
CREATE UNIQUE INDEX ON chair_waitlist (chair_id, barber_profile_id)
  WHERE status IN ('waiting', 'hold');
```

## Fluxos

### 1. Entrar na fila
- No fluxo de exploração/reserva do barbeiro: período desejado conflita com booking ativo (`pending`/`confirmed`) → UI mostra "Entrar na fila".
- Validações no insert: período no futuro; conflito real existe (se não há conflito, reservar direto — entrada na fila é rejeitada).

### 2. Promoção (trigger em `chair_bookings`)
- `AFTER UPDATE` quando status muda para `cancelled` ou `rejected`:
  1. Busca a entrada `waiting` mais antiga (`created_at`) da mesma cadeira cujo período desejado esteja **totalmente livre** — revalida overlap contra todos os bookings ativos, não só contra o slot recém-liberado.
  2. Promove: `status = 'hold'`, `hold_expires_at = now() + (waitlist_hold_minutes da org) * interval '1 minute'`, `notified_at = now()`.
  3. Insere registro em `notifications` para o barbeiro.
- Concorrência: promoção dentro da transação do trigger com lock na linha da entrada (`FOR UPDATE SKIP LOCKED` na seleção).

### 3. Enforcement do hold (trigger em `chair_bookings`)
- `BEFORE INSERT`: se existe hold ativo (`status = 'hold'` AND `hold_expires_at > now()`) de **outro** barbeiro na mesma cadeira com período sobreposto → RAISE EXCEPTION (booking bloqueado).
- Dono do hold reserva pelo fluxo normal de booking. `AFTER INSERT`: se o booking casa com um hold ativo do mesmo barbeiro → marca entrada `converted` + `converted_booking_id`.

### 4. Expiração (pg_cron, a cada 5 min)
Função `expire_waitlist_entries()`:
1. Holds com `hold_expires_at < now()` → `expired`; em seguida tenta promover o próximo `waiting` da mesma cadeira (mesma lógica da promoção).
2. Entradas `waiting` com `desired_start_at < now()` → `expired`.

### 5. Cancelamento pelo barbeiro
- Barbeiro cancela a própria entrada (`waiting` ou `hold`) → `cancelled`. Se era `hold`, tenta promover o próximo.

## UI

### Barbeiro (`/barber/*`)
- Botão "Entrar na fila" no fluxo de exploração/reserva quando o período conflita.
- Seção "Minha fila": lista de entradas com cadeira, ponto, período, status, posição na fila, botão cancelar.
- Hold ativo: destaque visual + countdown do prazo + CTA "Reservar agora" (leva ao fluxo de booking pré-preenchido).
- Notificação in-app (badge/toast existente).

### Dono (`/`) e Gerente (`/manager/*`)
- Read-only: contagem e lista da fila por cadeira no detalhe do ponto (`LocationDetailPage` e equivalente do gerente).
- Gerente escopado ao próprio ponto.

### Configurações (SettingsPage)
- Campo numérico "Prazo para confirmar vaga da fila (minutos)", default 60, min 5, max 1440.
- Mesmo padrão de persistência do `auto_confirm_bookings` (update direto em `organizations`).

## RLS

Seguir padrão SECURITY DEFINER (memory/rls-recursion-lessons — evitar recursão 42P17):
- **Barbeiro:** INSERT/SELECT/UPDATE(cancelar) das próprias entradas (`barber_profile_id = seu perfil`).
- **Dono:** SELECT de entradas da própria org (`organization_id`).
- **Gerente:** SELECT de entradas do próprio ponto (`location_id`), via helper SECURITY DEFINER existente.
- Promoção/expiração rodam em triggers/função SECURITY DEFINER — não dependem de policy do usuário.

## Casos de borda

- Booking `pending` rejeitado também libera slot → trigger cobre `cancelled` e `rejected`.
- Dois cancelamentos simultâneos na mesma cadeira → `FOR UPDATE SKIP LOCKED` evita promover a mesma entrada duas vezes.
- Barbeiro do hold já tem booking sobreposto em outra cadeira → GIST anti double-booking existente bloqueia a conversão; hold expira naturalmente e o próximo é promovido.
- Slot liberado não cobre o período desejado de ninguém na fila → ninguém é promovido (revalidação de disponibilidade total).
- Auto-confirm da org desligado: booking do hold nasce `pending` normalmente; se for rejeitado, o trigger de promoção roda de novo (a entrada já está `converted`; o barbeiro precisa entrar na fila de novo — comportamento aceito no MVP).

## Fora de escopo (MVP)

- Push/email/WhatsApp (roadmap #11).
- Gestão manual da fila por dono/gerente (remover/reordenar).
- Fila por ponto ou por cadeira genérica.
- Reserva automática ao vagar.

## Verificação

- Migrations aplicadas no banco canônico `qrfggirhrunuaecvltub` (ver memory/tech-stack-and-canonical-db).
- Teste SQL: cancelar booking com fila → primeiro vira `hold` + notificação criada; hold vencido → próximo promovido; booking de terceiro durante hold → bloqueado.
- Teste manual UI: fluxo completo barbeiro (entrar na fila → notificado → reservar), visão do dono/gerente, edição do prazo em Settings.
