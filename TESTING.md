# Testes — Barbearia MVP

## Estrutura

```
e2e/                    ← Testes E2E Playwright
  helpers.ts            ← Credenciais e constantes compartilhadas
  owner.spec.ts         ← Fluxos do Portal do Dono
  barber.spec.ts        ← Fluxos do Portal do Barbeiro
  manager.spec.ts       ← Fluxos do Portal do Gerente + fluxo cross-role

supabase/
  seed.test.sql         ← Seed de dados de teste (rodar antes dos E2E)
  tests/
    integration.sql     ← Testes de integração do banco (triggers, RLS, constraints)

src/
  lib/
    financial.test.ts       ← Unit: formatCurrency, getPeriodRange
    managerPermissions.test.ts ← Unit: parseManagerPermissions
  services/
    chairBookings.test.ts   ← Unit: resolveEffectiveAutoConfirm, checkBarberAvailability
    waitlist.test.ts        ← Unit: getFriendlyWaitlistError, queue_position mapping
  components/
    ConsentBanner.test.tsx  ← Componente: banner LGPD (6 cenários)
    NotificationBell.test.tsx ← Componente: badge, lista, mark-read (10 cenários)
    barber/
      ChairBookingForm.test.ts ← Unit: utilitários de formulário
```

---

## 1. Testes unitários (rápidos, sem banco)

```bash
# Rodar uma vez
npx vitest run

# Modo watch (desenvolvimento)
npx vitest

# Com cobertura
npx vitest run --coverage
```

**Resultado esperado:** 64 testes passando em ~2s.

---

## 2. Testes de integração do banco

### Pré-requisitos
- Uma **Supabase branch** criada (não usar produção)
- Usuários criados no Auth:
  - `dono@gmail.com` / `123456`
  - `barbeiro@gmail.com` / `123456`
  - `barbeiro2@gmail.com` / `123456`
  - `gerente@gmail.com` / `123456`

### Como criar os usuários (CLI)
```bash
supabase auth users create \
  --email owner@test.barbearia.dev \
  --password TestPass123! \
  --project-ref <sua-branch-ref>
# Repetir para os outros 3
```

### Rodar o seed
```bash
# Via Supabase Dashboard → SQL Editor → colar conteúdo de supabase/seed.test.sql
# OU via psql:
psql "$DATABASE_URL" -f supabase/seed.test.sql
```

### Rodar os testes de integração
```bash
psql "$DATABASE_URL" -f supabase/tests/integration.sql
```

**Resultado esperado:** mensagens `OK: ...` para todos os 7 blocos.

---

## 3. Testes E2E Playwright

### Pré-requisitos
- Seed de dados já rodado (passo 2 acima)
- App rodando localmente:
  ```bash
  npm run dev
  ```
- `.env.test` apontando para a branch de teste:
  ```
  VITE_SUPABASE_URL=<url-da-branch>
  VITE_SUPABASE_ANON_KEY=<anon-key-da-branch>
  ```

### Instalar browsers do Playwright (uma vez)
```bash
npx playwright install chromium
```

### Rodar os testes E2E
```bash
# Todos os testes E2E
npx playwright test

# Apenas um arquivo
npx playwright test e2e/owner.spec.ts

# Modo interativo (debug)
npx playwright test --ui

# Com variável de URL customizada
PLAYWRIGHT_BASE_URL=http://localhost:8080 npx playwright test
```

---

## Tabela de cenários cobertos

| Camada | Arquivo | Cenários |
|--------|---------|----------|
| Unit | `chairBookings.test.ts` | COALESCE auto-confirm (6), disponibilidade barbeiro (4) |
| Unit | `financial.test.ts` | formatCurrency (5), getPeriodRange (5) |
| Unit | `waitlist.test.ts` | getFriendlyWaitlistError (7), queue_position (4) |
| Unit | `managerPermissions.test.ts` | parseManagerPermissions (3) |
| Unit | `ChairBookingForm.test.ts` | Utilitários de UI (12) |
| Componente | `ConsentBanner.test.tsx` | LGPD banner (7) |
| Componente | `NotificationBell.test.tsx` | Badge, lista, mark-read (10) |
| Integração DB | `integration.sql` | Triggers, GIST, COALESCE, duração mínima (7 blocos) |
| E2E | `owner.spec.ts` | Login, nav, locais, cadeiras, reservas, contratos, auditoria, logout (8) |
| E2E | `barber.spec.ts` | Login, nav, explore, reservas, contratos, check-in, ganhos, LGPD, logout (10) |
| E2E | `manager.spec.ts` | Login, nav, reservas, cadeiras, financeiro, fluxo cross-role (6) |
| **Total** | | **~83 cenários** |
