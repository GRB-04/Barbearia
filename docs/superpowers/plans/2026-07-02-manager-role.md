# Manager Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar role de gerente por ponto físico com portal próprio `/manager/*`, permissões configuráveis pelo dono, e aprovação de reservas por ponto.

**Architecture:** O gerente é uma linha em `organization_barbers` com `role='manager'`, `location_id` (ponto fixo) e `permissions` (JSONB). Reutiliza o invite flow de barbeiro (`claim_barber_invitation`), o hook `useBarberProfile` (que já carrega a linha de `organization_barbers`), e o padrão de layout de `BarberLayout`. RLS policies novas dão ao gerente acesso escopado ao seu `location_id`.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (PostgreSQL/RLS), Tailwind + shadcn/ui, react-router v6, vitest.

**Spec:** `docs/superpowers/specs/2026-07-02-manager-role-design.md`

**Decisões vs. spec:**
- O spec propunha um hook novo `useManagerProfile()`. O plano estende `useBarberProfile` — a linha de `organization_barbers` (com role/location/permissions) já é carregada lá; hook novo duplicaria o fetch.
- A simplificação do auto-confirm (deprecar `locations.auto_confirm_bookings`) foi adiada: a lógica COALESCE atual continua funcionando e não bloqueia a aprovação por gerente. Fica para depois, sem risco de regressão agora.
- Filtro por ponto no BookingsPage do dono ficou fora (YAGNI — o dono continua vendo tudo).

## Global Constraints

- Idioma da UI: português brasileiro (seguir textos existentes)
- Estilo visual: seguir `BarberLayout.tsx` / páginas existentes (rounded-2xl, bg-card, etc.)
- Permissões opcionais (JSONB): `can_manage_payments`, `can_edit_chairs`, `can_view_financials`, `can_invite_barbers` — todas default `false`
- Permissões fixas do gerente: ver barbeiros/contratos/cadeiras do ponto + aprovar/rejeitar reservas quando `organizations.auto_confirm_bookings = false`
- Migrations SQL: aplicar via MCP Supabase (`apply_migration`) E salvar arquivo em `supabase/migrations/`
- Após mudança de schema: rodar `npm run types` para regenerar `src/integrations/supabase/types.ts`
- Verificação por task: `npm run build` deve passar; testes via `npm run test`

---

### Task 1: Migration — colunas, claim function, RLS

**Files:**
- Create: `supabase/migrations/20260702000100_manager_role.sql`
- Modify: `src/integrations/supabase/types.ts` (regenerado via `npm run types`)

**Interfaces:**
- Produces: colunas `organization_barbers.location_id uuid` e `organization_barbers.permissions jsonb`; função `claim_barber_invitation` preservando role; função helper SQL `is_location_manager(uuid)`; RLS policies de manager.

- [ ] **Step 1: Escrever a migration**

```sql
-- Manager role: location binding, permissions, invitation fix, RLS
begin;

-- 1) Colunas novas em organization_barbers
alter table public.organization_barbers
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists permissions jsonb not null default '{}'::jsonb;

create index if not exists idx_organization_barbers_location_id
  on public.organization_barbers (location_id);

-- 2) Helper: o usuário autenticado é gerente deste location?
create or replace function public.is_location_manager(p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_barbers ob
    where ob.user_id = auth.uid()
      and ob.role = 'manager'
      and ob.location_id = p_location_id
  );
$$;

grant execute on function public.is_location_manager(uuid) to authenticated;

-- Helper: retorna o location_id gerenciado pelo usuário (null se não é gerente)
create or replace function public.managed_location_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ob.location_id
  from public.organization_barbers ob
  where ob.user_id = auth.uid()
    and ob.role = 'manager'
    and ob.location_id is not null
  limit 1;
$$;

grant execute on function public.managed_location_id() to authenticated;

-- Helper: checa permissão opcional do gerente
create or replace function public.manager_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select (ob.permissions ->> p_permission)::boolean
      from public.organization_barbers ob
      where ob.user_id = auth.uid()
        and ob.role = 'manager'
      limit 1
    ),
    false
  );
$$;

grant execute on function public.manager_has_permission(text) to authenticated;

-- 3) claim_barber_invitation: preservar role pré-existente (manager)
create or replace function public.claim_barber_invitation(
  p_organization_id uuid,
  p_full_name text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_name text;
  v_profile public.barber_profiles%rowtype;
  v_barber public.organization_barbers%rowtype;
begin
  if v_user_id is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if p_organization_id is null then
    raise exception 'Organização inválida.';
  end if;

  select u.email
    into v_email
  from auth.users u
  where u.id = v_user_id;

  if v_email is null then
    raise exception 'Usuário sem e-mail.';
  end if;

  v_name := coalesce(nullif(trim(p_full_name), ''), split_part(v_email, '@', 1));

  -- 1) Atualiza ou cria o barber_profile
  insert into public.barber_profiles (
    user_id,
    full_name,
    phone,
    email,
    organization_id
  )
  values (
    v_user_id,
    v_name,
    nullif(trim(p_phone), ''),
    v_email,
    p_organization_id
  )
  on conflict (user_id)
  do update set
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, public.barber_profiles.phone),
    email = excluded.email,
    organization_id = coalesce(public.barber_profiles.organization_id, excluded.organization_id)
  returning *
  into v_profile;

  -- 2) Tenta atualizar um convite existente (organization_barbers)
  --    IMPORTANTE: NÃO altera role/location_id/permissions — preserva o que o dono configurou.
  update public.organization_barbers
  set
    user_id = v_user_id,
    barber_profile_id = v_profile.id,
    full_name = coalesce(public.organization_barbers.full_name, v_profile.full_name),
    email = coalesce(public.organization_barbers.email, v_email),
    phone = coalesce(public.organization_barbers.phone, v_profile.phone)
  where public.organization_barbers.organization_id = p_organization_id
    and lower(public.organization_barbers.email) = lower(v_email)
    and (public.organization_barbers.user_id is null or public.organization_barbers.user_id = v_user_id)
    and (
      public.organization_barbers.barber_profile_id is null
      or public.organization_barbers.barber_profile_id = v_profile.id
    )
  returning *
  into v_barber;

  -- 3) Se não existia convite, AUTO-CADASTRA como barbeiro comum
  if v_barber.id is null then
    insert into public.organization_barbers (
      organization_id,
      barber_profile_id,
      user_id,
      full_name,
      email,
      phone,
      role
    ) values (
      p_organization_id,
      v_profile.id,
      v_user_id,
      coalesce(v_profile.full_name, v_name),
      v_email,
      v_profile.phone,
      'barber'
    ) returning * into v_barber;
  end if;

  -- 4) Sincroniza role do profile com o roster (manager fica manager)
  update public.barber_profiles
  set role = v_barber.role
  where id = v_profile.id
    and role is distinct from v_barber.role;

  return jsonb_build_object(
    'barber_profile_id', v_profile.id,
    'barber_id', v_barber.id,
    'organization_id', v_barber.organization_id,
    'role', v_barber.role
  );
end;
$$;

grant execute on function public.claim_barber_invitation(uuid, text, text) to authenticated;

-- 4) RLS policies para manager (escopadas ao location gerenciado)

-- chair_bookings: manager vê e atualiza status das reservas do seu ponto
drop policy if exists "manager_select_location_bookings" on public.chair_bookings;
create policy "manager_select_location_bookings"
  on public.chair_bookings for select to authenticated
  using (
    chair_id in (
      select c.id from public.chairs c
      where c.location_id = public.managed_location_id()
    )
  );

drop policy if exists "manager_update_location_bookings" on public.chair_bookings;
create policy "manager_update_location_bookings"
  on public.chair_bookings for update to authenticated
  using (
    chair_id in (
      select c.id from public.chairs c
      where c.location_id = public.managed_location_id()
    )
  )
  with check (
    chair_id in (
      select c.id from public.chairs c
      where c.location_id = public.managed_location_id()
    )
  );

-- contracts: manager vê contratos do seu ponto
drop policy if exists "manager_select_location_contracts" on public.contracts;
create policy "manager_select_location_contracts"
  on public.contracts for select to authenticated
  using (
    chair_id in (
      select c.id from public.chairs c
      where c.location_id = public.managed_location_id()
    )
  );

-- chairs: manager vê cadeiras do ponto; edita só com can_edit_chairs
drop policy if exists "manager_select_location_chairs" on public.chairs;
create policy "manager_select_location_chairs"
  on public.chairs for select to authenticated
  using (location_id = public.managed_location_id());

drop policy if exists "manager_update_location_chairs" on public.chairs;
create policy "manager_update_location_chairs"
  on public.chairs for update to authenticated
  using (
    location_id = public.managed_location_id()
    and public.manager_has_permission('can_edit_chairs')
  )
  with check (
    location_id = public.managed_location_id()
    and public.manager_has_permission('can_edit_chairs')
  );

drop policy if exists "manager_insert_location_chairs" on public.chairs;
create policy "manager_insert_location_chairs"
  on public.chairs for insert to authenticated
  with check (
    location_id = public.managed_location_id()
    and public.manager_has_permission('can_edit_chairs')
  );

-- locations: manager vê o próprio ponto
drop policy if exists "manager_select_own_location" on public.locations;
create policy "manager_select_own_location"
  on public.locations for select to authenticated
  using (id = public.managed_location_id());

-- organization_barbers: manager vê o roster da sua organização
-- (necessário para listar barbeiros do ponto e para o próprio login do gerente)
drop policy if exists "manager_select_org_roster" on public.organization_barbers;
create policy "manager_select_org_roster"
  on public.organization_barbers for select to authenticated
  using (
    organization_id in (
      select ob.organization_id from public.organization_barbers ob
      where ob.user_id = auth.uid() and ob.role = 'manager'
    )
  );

-- barber_profiles: manager vê perfis dos barbeiros do roster da org
drop policy if exists "manager_select_org_barber_profiles" on public.barber_profiles;
create policy "manager_select_org_barber_profiles"
  on public.barber_profiles for select to authenticated
  using (
    id in (
      select ob.barber_profile_id from public.organization_barbers ob
      where ob.organization_id in (
        select ob2.organization_id from public.organization_barbers ob2
        where ob2.user_id = auth.uid() and ob2.role = 'manager'
      )
    )
  );

-- payments: manager com can_manage_payments vê e atualiza pagamentos das reservas do ponto
drop policy if exists "manager_select_location_payments" on public.payments;
create policy "manager_select_location_payments"
  on public.payments for select to authenticated
  using (
    public.manager_has_permission('can_manage_payments')
    and booking_id in (
      select cb.id from public.chair_bookings cb
      join public.chairs c on c.id = cb.chair_id
      where c.location_id = public.managed_location_id()
    )
  );

drop policy if exists "manager_update_location_payments" on public.payments;
create policy "manager_update_location_payments"
  on public.payments for update to authenticated
  using (
    public.manager_has_permission('can_manage_payments')
    and booking_id in (
      select cb.id from public.chair_bookings cb
      join public.chairs c on c.id = cb.chair_id
      where c.location_id = public.managed_location_id()
    )
  )
  with check (
    public.manager_has_permission('can_manage_payments')
    and booking_id in (
      select cb.id from public.chair_bookings cb
      join public.chairs c on c.id = cb.chair_id
      where c.location_id = public.managed_location_id()
    )
  );

-- organization_barbers: owner pode INSERT/UPDATE/DELETE gerentes (já coberto por policies de owner existentes;
-- se não houver, as policies de owner atuais em organization_barbers permanecem a fonte de escrita)

commit;
```

- [ ] **Step 2: Aplicar migration via MCP Supabase**

Usar `mcp__claude_ai_Supabase__apply_migration` com name `manager_role` e o SQL acima.
Expected: sucesso sem erro.

- [ ] **Step 3: Salvar o arquivo da migration no repo**

Salvar o mesmo SQL em `supabase/migrations/20260702000100_manager_role.sql`.

- [ ] **Step 4: Regenerar types**

Run: `npm run types`
Expected: `src/integrations/supabase/types.ts` atualizado com `location_id` e `permissions` em `organization_barbers`.

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260702000100_manager_role.sql src/integrations/supabase/types.ts
git commit -m "feat: manager role schema, invitation fix, and RLS policies"
```

---

### Task 2: Helper de permissões + testes

**Files:**
- Create: `src/lib/managerPermissions.ts`
- Test: `src/lib/managerPermissions.test.ts`

**Interfaces:**
- Produces:
  - `type ManagerPermissions = { can_manage_payments: boolean; can_edit_chairs: boolean; can_view_financials: boolean; can_invite_barbers: boolean }`
  - `parseManagerPermissions(raw: unknown): ManagerPermissions` — parse seguro do JSONB (qualquer input → objeto com defaults false)
  - `DEFAULT_MANAGER_PERMISSIONS: ManagerPermissions`
  - `MANAGER_PERMISSION_LABELS: Record<keyof ManagerPermissions, string>` — labels pt-BR para a UI

- [ ] **Step 1: Escrever o teste que falha**

```typescript
// src/lib/managerPermissions.test.ts
import { describe, it, expect } from "vitest";
import {
  parseManagerPermissions,
  DEFAULT_MANAGER_PERMISSIONS,
} from "./managerPermissions";

describe("parseManagerPermissions", () => {
  it("returns all-false defaults for null/undefined/non-object", () => {
    expect(parseManagerPermissions(null)).toEqual(DEFAULT_MANAGER_PERMISSIONS);
    expect(parseManagerPermissions(undefined)).toEqual(DEFAULT_MANAGER_PERMISSIONS);
    expect(parseManagerPermissions("garbage")).toEqual(DEFAULT_MANAGER_PERMISSIONS);
    expect(parseManagerPermissions(42)).toEqual(DEFAULT_MANAGER_PERMISSIONS);
  });

  it("reads known keys and coerces to boolean", () => {
    const parsed = parseManagerPermissions({
      can_manage_payments: true,
      can_edit_chairs: "true", // valor não-boolean vira false (só boolean true conta)
    });
    expect(parsed.can_manage_payments).toBe(true);
    expect(parsed.can_edit_chairs).toBe(false);
    expect(parsed.can_view_financials).toBe(false);
    expect(parsed.can_invite_barbers).toBe(false);
  });

  it("ignores unknown keys", () => {
    const parsed = parseManagerPermissions({ hacker_key: true });
    expect(parsed).toEqual(DEFAULT_MANAGER_PERMISSIONS);
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `npm run test`
Expected: FAIL — módulo `./managerPermissions` não existe.

- [ ] **Step 3: Implementar**

```typescript
// src/lib/managerPermissions.ts
export type ManagerPermissions = {
  can_manage_payments: boolean;
  can_edit_chairs: boolean;
  can_view_financials: boolean;
  can_invite_barbers: boolean;
};

export const DEFAULT_MANAGER_PERMISSIONS: ManagerPermissions = {
  can_manage_payments: false,
  can_edit_chairs: false,
  can_view_financials: false,
  can_invite_barbers: false,
};

export const MANAGER_PERMISSION_LABELS: Record<keyof ManagerPermissions, string> = {
  can_manage_payments: "Gerenciar pagamentos dos barbeiros",
  can_edit_chairs: "Editar cadeiras do ponto",
  can_view_financials: "Ver relatório financeiro do ponto",
  can_invite_barbers: "Convidar barbeiros",
};

export function parseManagerPermissions(raw: unknown): ManagerPermissions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_MANAGER_PERMISSIONS };
  }

  const source = raw as Record<string, unknown>;
  const result = { ...DEFAULT_MANAGER_PERMISSIONS };

  (Object.keys(DEFAULT_MANAGER_PERMISSIONS) as (keyof ManagerPermissions)[]).forEach(
    (key) => {
      result[key] = source[key] === true;
    }
  );

  return result;
}
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `npm run test`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/lib/managerPermissions.ts src/lib/managerPermissions.test.ts
git commit -m "feat: manager permissions parsing helper"
```

---

### Task 3: Expor dados de gerente no useBarberProfile

**Files:**
- Modify: `src/hooks/useBarberProfile.tsx`

**Interfaces:**
- Consumes: `parseManagerPermissions`, `ManagerPermissions` de `src/lib/managerPermissions.ts`
- Produces (adições ao contexto `useBarberProfile()`):
  - `isLocationManager: boolean` — true se `barber.role === 'manager'` (linha de organization_barbers)
  - `managerLocationId: string | null` — `barber.location_id`
  - `managerPermissions: ManagerPermissions` — parse de `barber.permissions`

**Nota:** o hook já busca a linha de `organization_barbers` (variável `barber`). Após Task 1, essa linha tem `location_id` e `permissions`. O `isManager` existente (checa `barberProfile.role`, incluindo owner) permanece intocado para não quebrar `BarberLayout`.

- [ ] **Step 1: Adicionar campos ao tipo do contexto**

Em `src/hooks/useBarberProfile.tsx`, no type `BarberProfileContextType`, adicionar após `isReceptionist: boolean;`:

```typescript
  isLocationManager: boolean;
  managerLocationId: string | null;
  managerPermissions: ManagerPermissions;
```

E adicionar import no topo:

```typescript
import {
  parseManagerPermissions,
  type ManagerPermissions,
} from "@/lib/managerPermissions";
```

- [ ] **Step 2: Calcular os valores no provider**

Após o `useMemo` de `isReceptionist` (linha ~275), adicionar:

```typescript
  const isLocationManager = useMemo(() => {
    return (barber as any)?.role === "manager";
  }, [barber]);

  const managerLocationId = useMemo(() => {
    if (!isLocationManager) return null;
    return ((barber as any)?.location_id as string | null) ?? null;
  }, [barber, isLocationManager]);

  const managerPermissions = useMemo(() => {
    return parseManagerPermissions((barber as any)?.permissions);
  }, [barber]);
```

Adicionar os três ao objeto `value` do `useMemo` final (e ao array de deps).

**Nota:** invalidar cache de sessão: mudar `BARBER_PROFILE_CACHE_KEY` de `"barber-profile-cache-v5"` para `"barber-profile-cache-v6"` (a linha cacheada de `barber` agora precisa conter as colunas novas).

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBarberProfile.tsx
git commit -m "feat: expose manager location and permissions in useBarberProfile"
```

---

### Task 4: ManagerLayout + rotas /manager/* no App.tsx

**Files:**
- Create: `src/components/ManagerLayout.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useBarberProfile().isLocationManager`, `managerPermissions`
- Produces: componente `ManagerLayout` (sidebar com nav condicionada a permissões); rotas `/manager/*` protegidas; redirecionamento de gerente logado para `/manager/dashboard`.

- [ ] **Step 1: Criar ManagerLayout**

```tsx
// src/components/ManagerLayout.tsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Armchair,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LogOut,
  Scissors,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import NotificationBell from "@/components/NotificationBell";

function navLinkClass(isActive: boolean) {
  return [
    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
    isActive
      ? "bg-accent text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  ].join(" ");
}

export default function ManagerLayout() {
  const navigate = useNavigate();
  const { managerPermissions } = useBarberProfile();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Você saiu da sua conta.");
    navigate("/barber/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-border bg-card lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col p-4">
            <div className="mb-6 flex items-center justify-between gap-3 px-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
                  <Scissors className="h-5 w-5 text-foreground" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Portal do gerente
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gestão do ponto físico
                  </p>
                </div>
              </div>
              <NotificationBell />
            </div>

            <nav className="flex flex-col gap-1">
              <NavLink
                to="/manager/dashboard"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </NavLink>

              <NavLink
                to="/manager/bookings"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <CalendarDays className="h-4 w-4" />
                Reservas
              </NavLink>

              <NavLink
                to="/manager/barbers"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <Users className="h-4 w-4" />
                Barbeiros
              </NavLink>

              <NavLink
                to="/manager/contracts"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <FileText className="h-4 w-4" />
                Contratos
              </NavLink>

              <NavLink
                to="/manager/chairs"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <Armchair className="h-4 w-4" />
                Cadeiras
              </NavLink>

              {managerPermissions.can_manage_payments && (
                <NavLink
                  to="/manager/payments"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <Wallet className="h-4 w-4" />
                  Cobranças
                </NavLink>
              )}

              {managerPermissions.can_view_financials && (
                <NavLink
                  to="/manager/financials"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <TrendingUp className="h-4 w-4" />
                  Financeiro
                </NavLink>
              )}
            </nav>

            <div className="mt-auto pt-6">
              <Button
                variant="outline"
                className="w-full justify-start rounded-2xl"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar ManagerRoutes no App.tsx**

Em `src/App.tsx`:

Imports novos (páginas criadas nas Tasks 5-8 — nesta task criar stubs, ver Step 3):

```tsx
import ManagerLayout from "./components/ManagerLayout";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import ManagerBookingsPage from "./pages/manager/ManagerBookingsPage";
import ManagerBarbersPage from "./pages/manager/ManagerBarbersPage";
import ManagerContractsPage from "./pages/manager/ManagerContractsPage";
import ManagerChairsPage from "./pages/manager/ManagerChairsPage";
import ManagerPaymentsPage from "./pages/manager/ManagerPaymentsPage";
import ManagerFinancialsPage from "./pages/manager/ManagerFinancialsPage";
```

Componente novo (após `BarberRoutes`):

```tsx
function ManagerRoutes() {
  const { user, loading: authLoading } = useAuth();
  const {
    isLocationManager,
    managerPermissions,
    loading: barberLoading,
  } = useBarberProfile();

  if (authLoading || barberLoading) {
    return (
      <LoadingScreen description="Estamos carregando o acesso do gerente." />
    );
  }

  if (!user) {
    return <Navigate to="/barber/auth" replace />;
  }

  if (!isLocationManager) {
    return <Navigate to="/" replace />;
  }

  return (
    <Routes>
      <Route path="/" element={<ManagerLayout />}>
        <Route index element={<Navigate to="/manager/dashboard" replace />} />
        <Route path="dashboard" element={<ManagerDashboard />} />
        <Route path="bookings" element={<ManagerBookingsPage />} />
        <Route path="barbers" element={<ManagerBarbersPage />} />
        <Route path="contracts" element={<ManagerContractsPage />} />
        <Route path="chairs" element={<ManagerChairsPage />} />
        <Route
          path="payments"
          element={
            managerPermissions.can_manage_payments ? (
              <ManagerPaymentsPage />
            ) : (
              <Navigate to="/manager/dashboard" replace />
            )
          }
        />
        <Route
          path="financials"
          element={
            managerPermissions.can_view_financials ? (
              <ManagerFinancialsPage />
            ) : (
              <Navigate to="/manager/dashboard" replace />
            )
          }
        />
        <Route path="*" element={<Navigate to="/manager/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
```

Registrar a rota no `App` (antes de `/*`):

```tsx
<Routes>
  <Route path="/barber/*" element={<BarberRoutes />} />
  <Route path="/manager/*" element={<ManagerRoutes />} />
  <Route path="/*" element={<OwnerRoutes />} />
</Routes>
```

Redirecionamentos de gerente nos fluxos existentes:

Em `OwnerRoutes`, logo após `const isOperationalBarber = ...` (linha ~105), adicionar:

```tsx
  const { isLocationManager } = useBarberProfile();
  // (mover para a desestruturação existente do useBarberProfile no topo da função)

  if (isLocationManager && !isOwner) {
    return <Navigate to="/manager/dashboard" replace />;
  }
```

Em `BarberRoutes`, após `const hasOperationalBarber = ...` (linha ~163), adicionar:

```tsx
  const { isLocationManager } = useBarberProfile();
  // (mover para a desestruturação existente)

  if (isLocationManager && !isOwner) {
    return <Navigate to="/manager/dashboard" replace />;
  }
```

- [ ] **Step 3: Criar stubs das 7 páginas**

Criar `src/pages/manager/` com 7 arquivos stub (mesmo padrão para todos):

```tsx
// src/pages/manager/ManagerDashboard.tsx (repetir padrão para os outros 6)
export default function ManagerDashboard() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
      <p className="text-sm text-muted-foreground">Em construção.</p>
    </div>
  );
}
```

Arquivos: `ManagerDashboard.tsx`, `ManagerBookingsPage.tsx`, `ManagerBarbersPage.tsx`, `ManagerContractsPage.tsx`, `ManagerChairsPage.tsx`, `ManagerPaymentsPage.tsx`, `ManagerFinancialsPage.tsx` — cada um com o `h1` correspondente (Reservas, Barbeiros, Contratos, Cadeiras, Cobranças, Financeiro).

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 5: Commit**

```bash
git add src/components/ManagerLayout.tsx src/pages/manager/ src/App.tsx
git commit -m "feat: manager portal routing, layout, and page stubs"
```

---

### Task 5: Serviço de dados do gerente + Dashboard + Reservas

**Files:**
- Create: `src/services/managerData.ts`
- Modify: `src/pages/manager/ManagerDashboard.tsx`
- Modify: `src/pages/manager/ManagerBookingsPage.tsx`

**Interfaces:**
- Consumes: `managerLocationId` do `useBarberProfile`
- Produces em `src/services/managerData.ts`:
  - `fetchLocationInfo(locationId: string)` → `{ id, name, address }`
  - `fetchLocationBookings(locationId: string, onlyPending: boolean)` → linhas de `chair_bookings` com join em chairs/barber_profiles
  - `updateBookingStatus(bookingId: string, status: "confirmed" | "rejected")`
  - `fetchLocationChairs(locationId: string)` → linhas de `chairs`
  - `fetchLocationContracts(locationId: string)` → linhas de `contracts` com joins

- [ ] **Step 1: Criar o serviço**

```typescript
// src/services/managerData.ts
import { supabase } from "@/integrations/supabase/client";

export type ManagerBookingRow = {
  id: string;
  status: string;
  start_at: string;
  end_at: string;
  notes: string | null;
  created_at: string;
  chair_identifier: string | null;
  barber_full_name: string | null;
};

export async function fetchLocationInfo(locationId: string) {
  const { data, error } = await supabase
    .from("locations")
    .select("id, name, address")
    .eq("id", locationId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function fetchLocationBookings(
  locationId: string,
  onlyPending: boolean
): Promise<ManagerBookingRow[]> {
  let query = supabase
    .from("chair_bookings")
    .select(
      `
      id,
      status,
      start_at,
      end_at,
      notes,
      created_at,
      chairs!inner ( identifier, location_id ),
      barber_profiles ( full_name )
    `
    )
    .eq("chairs.location_id", locationId)
    .order("created_at", { ascending: false });

  if (onlyPending) {
    query = query.eq("status", "pending");
  }

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    status: row.status,
    start_at: row.start_at,
    end_at: row.end_at,
    notes: row.notes,
    created_at: row.created_at,
    chair_identifier: row.chairs?.identifier ?? null,
    barber_full_name: row.barber_profiles?.full_name ?? null,
  }));
}

export async function updateBookingStatus(
  bookingId: string,
  status: "confirmed" | "rejected"
) {
  const { error } = await supabase
    .from("chair_bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) throw error;
}

export async function fetchLocationChairs(locationId: string) {
  const { data, error } = await supabase
    .from("chairs")
    .select("*")
    .eq("location_id", locationId)
    .order("identifier", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function fetchLocationContracts(locationId: string) {
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `
      *,
      chairs!inner ( identifier, location_id ),
      barber_profiles ( full_name )
    `
    )
    .eq("chairs.location_id", locationId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as any[];
}
```

- [ ] **Step 2: Implementar ManagerBookingsPage**

Modelar em cima de `src/pages/BookingsPage.tsx` (mesmos badges/labels de status, filtro pending/all, botões Confirmar/Rejeitar), substituindo o fetch por `fetchLocationBookings(managerLocationId, filter === "pending")` e o update por `updateBookingStatus`. `managerLocationId` vem de `useBarberProfile()`. Se `managerLocationId` for null, mostrar aviso "Sua conta de gerente não está vinculada a um ponto físico. Fale com o dono da organização."

Copiar de `BookingsPage.tsx`: `statusBadge`, `statusLabel`, o card de reserva (bloco JSX do map) e o padrão de `actioning`/`toast`.

- [ ] **Step 3: Implementar ManagerDashboard**

Dashboard mostra: nome do ponto (via `fetchLocationInfo`), contagem de reservas pendentes (`fetchLocationBookings(id, true).length`), total de cadeiras (`fetchLocationChairs`), contratos ativos (`fetchLocationContracts` filtrado por `status === 'active'`). Cards no padrão visual das páginas existentes (`rounded-3xl border border-border bg-card p-6`). Link "Ver reservas pendentes" → `/manager/bookings`.

- [ ] **Step 4: Verificar build**

Run: `npm run build`
Expected: sucesso.

- [ ] **Step 5: Commit**

```bash
git add src/services/managerData.ts src/pages/manager/ManagerDashboard.tsx src/pages/manager/ManagerBookingsPage.tsx
git commit -m "feat: manager dashboard and location-scoped booking approval"
```

---

### Task 6: Páginas Barbeiros, Contratos e Cadeiras do gerente

**Files:**
- Modify: `src/pages/manager/ManagerBarbersPage.tsx`
- Modify: `src/pages/manager/ManagerContractsPage.tsx`
- Modify: `src/pages/manager/ManagerChairsPage.tsx`
- Modify: `src/services/managerData.ts` (adicionar `fetchLocationBarbers`, `updateChairStatus`)

**Interfaces:**
- Consumes: `managerLocationId`, `managerPermissions.can_edit_chairs`, `managerPermissions.can_invite_barbers`, `fetchLocationChairs`, `fetchLocationContracts`
- Produces:
  - `fetchLocationBarbers(locationId: string)` → barbeiros distintos com reservas no ponto
  - `updateChairStatus(chairId: string, status: string)`

- [ ] **Step 1: Adicionar funções ao serviço**

```typescript
// adicionar em src/services/managerData.ts

// Barbeiros que têm reservas ou contratos no ponto + roster completo da org
export async function fetchLocationBarbers(locationId: string) {
  // barbeiros distintos com reservas no ponto
  const { data, error } = await supabase
    .from("chair_bookings")
    .select(
      `
      barber_profile_id,
      barber_profiles ( id, full_name, email, phone ),
      chairs!inner ( location_id )
    `
    )
    .eq("chairs.location_id", locationId);

  if (error) throw error;

  const seen = new Map<string, any>();
  ((data ?? []) as any[]).forEach((row) => {
    const p = row.barber_profiles;
    if (p?.id && !seen.has(p.id)) seen.set(p.id, p);
  });

  return Array.from(seen.values()) as {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  }[];
}

export async function updateChairStatus(chairId: string, status: string) {
  const { error } = await supabase
    .from("chairs")
    .update({ status })
    .eq("id", chairId);

  if (error) throw error;
}
```

- [ ] **Step 2: ManagerBarbersPage**

Lista de cards com nome/email/telefone dos barbeiros de `fetchLocationBarbers(managerLocationId)`. Se `managerPermissions.can_invite_barbers`, mostrar botão "Copiar link de convite" que copia `${window.location.origin}/barber/auth?org=${organizationId}` (organizationId vem de `barber.organization_id` via `useBarberProfile().barber`). Usar `navigator.clipboard.writeText` + `toast.success("Link copiado.")` — mesmo padrão da `BarbersPage.tsx` do owner.

- [ ] **Step 3: ManagerContractsPage**

Lista de contratos de `fetchLocationContracts(managerLocationId)` agrupados por status (active/pending/ended), badges seguindo `ContractsPage.tsx` do owner. Somente leitura. Mostrar: barbeiro, cadeira, período, valor.

- [ ] **Step 4: ManagerChairsPage**

Lista de cadeiras de `fetchLocationChairs(managerLocationId)` com identifier + status badge. Se `managerPermissions.can_edit_chairs`, mostrar Select de status (available/occupied/maintenance — copiar opções/labels de `LocationDetailPage.tsx`) chamando `updateChairStatus`; senão, somente leitura. RLS já bloqueia server-side sem a permissão.

- [ ] **Step 5: Verificar build + commit**

Run: `npm run build`
Expected: sucesso.

```bash
git add src/services/managerData.ts src/pages/manager/ManagerBarbersPage.tsx src/pages/manager/ManagerContractsPage.tsx src/pages/manager/ManagerChairsPage.tsx
git commit -m "feat: manager barbers, contracts, and chairs pages"
```

---

### Task 7: Página de Cobranças (controle completo)

**Files:**
- Modify: `src/pages/manager/ManagerPaymentsPage.tsx`
- Modify: `src/services/managerData.ts` (adicionar `fetchLocationPayments`, `registerManualPayment`)

**Interfaces:**
- Consumes: `managerLocationId`, tabela `payments` (colunas: `id, booking_id, amount, status, due_date, paid_at, payment_method, reference, organization_id`)
- Produces:
  - `fetchLocationPayments(locationId: string)` → pagamentos com join em booking/chair/barber
  - `registerManualPayment(paymentId: string, method: string)` → marca `status='paid'`, `paid_at=now()`, `reference='MANUAL_<timestamp>'`

- [ ] **Step 1: Adicionar funções ao serviço**

```typescript
// adicionar em src/services/managerData.ts

export type ManagerPaymentRow = {
  id: string;
  amount: number;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  reference: string | null;
  barber_full_name: string | null;
  chair_identifier: string | null;
  booking_start_at: string | null;
};

export async function fetchLocationPayments(
  locationId: string
): Promise<ManagerPaymentRow[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      amount,
      status,
      due_date,
      paid_at,
      payment_method,
      reference,
      chair_bookings!inner (
        start_at,
        chairs!inner ( identifier, location_id ),
        barber_profiles ( full_name )
      )
    `
    )
    .eq("chair_bookings.chairs.location_id", locationId)
    .order("due_date", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    amount: row.amount,
    status: row.status,
    due_date: row.due_date,
    paid_at: row.paid_at,
    payment_method: row.payment_method,
    reference: row.reference,
    barber_full_name: row.chair_bookings?.barber_profiles?.full_name ?? null,
    chair_identifier: row.chair_bookings?.chairs?.identifier ?? null,
    booking_start_at: row.chair_bookings?.start_at ?? null,
  }));
}

export async function registerManualPayment(paymentId: string, method: string) {
  const { error } = await supabase
    .from("payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_method: method,
      reference: `MANUAL_${Date.now()}`,
    })
    .eq("id", paymentId);

  if (error) throw error;
}
```

- [ ] **Step 2: Implementar ManagerPaymentsPage**

Duas seções:
1. **Pendentes** — pagamentos `status === 'pending'`: card com barbeiro, cadeira, valor (`Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`), vencimento (`format(date, "dd/MM/yyyy", { locale: ptBR })`), destaque vermelho se `due_date < now` ("Em atraso"). Botão "Registrar recebimento" abre dialog (shadcn `Dialog`) com Select de método (pix/dinheiro/cartão) → chama `registerManualPayment` → toast + refetch.
2. **Histórico** — pagamentos `status === 'paid'`: tabela com barbeiro, valor, método, data de pagamento, referência (comprovante).

- [ ] **Step 3: Verificar build + commit**

Run: `npm run build`
Expected: sucesso.

```bash
git add src/services/managerData.ts src/pages/manager/ManagerPaymentsPage.tsx
git commit -m "feat: manager payment collection page"
```

---

### Task 8: Página Financeiro do ponto

**Files:**
- Modify: `src/pages/manager/ManagerFinancialsPage.tsx`

**Interfaces:**
- Consumes: `fetchLocationPayments`, `fetchLocationContracts`, `managerLocationId`

- [ ] **Step 1: Implementar ManagerFinancialsPage**

Reutiliza `fetchLocationPayments` + `fetchLocationContracts`. Cards de resumo (calculados client-side sobre os dados carregados):
- Receita recebida no mês: soma de `amount` de payments `paid` com `paid_at` no mês corrente
- Receita pendente: soma de `amount` de payments `pending`
- Em atraso: soma de `amount` de payments `pending` com `due_date < now`
- Contratos ativos: contagem de contracts `status === 'active'`

Filtro de período (hoje/semana/mês) seguindo padrão de `FinancialReportPage.tsx` do owner. Tabela de pagamentos do período abaixo dos cards.

- [ ] **Step 2: Verificar build + commit**

Run: `npm run build`
Expected: sucesso.

```bash
git add src/pages/manager/ManagerFinancialsPage.tsx
git commit -m "feat: manager location financial report"
```

---

### Task 9: Aba "Usuários" no Settings do dono (CRUD de gerentes)

**Files:**
- Modify: `src/pages/SettingsPage.tsx`
- Create: `src/components/ManagerUsersSection.tsx`

**Interfaces:**
- Consumes: `useOrganization().organization`, `MANAGER_PERMISSION_LABELS`, `parseManagerPermissions`, `DEFAULT_MANAGER_PERMISSIONS` de `src/lib/managerPermissions.ts`
- Produces: seção de gestão de gerentes renderizada dentro do SettingsPage

- [ ] **Step 1: Criar ManagerUsersSection**

```tsx
// src/components/ManagerUsersSection.tsx
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus } from "lucide-react";
import {
  DEFAULT_MANAGER_PERMISSIONS,
  MANAGER_PERMISSION_LABELS,
  parseManagerPermissions,
  type ManagerPermissions,
} from "@/lib/managerPermissions";

type ManagerRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  user_id: string | null;
  location_id: string | null;
  permissions: unknown;
};

type LocationOption = { id: string; name: string };

export default function ManagerUsersSection() {
  const { organization } = useOrganization();
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // form state
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [permissions, setPermissions] = useState<ManagerPermissions>({
    ...DEFAULT_MANAGER_PERMISSIONS,
  });

  const fetchData = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    try {
      const [managersRes, locationsRes] = await Promise.all([
        supabase
          .from("organization_barbers")
          .select("id, full_name, email, user_id, location_id, permissions")
          .eq("organization_id", organization.id)
          .eq("role", "manager")
          .order("created_at", { ascending: true }),
        supabase
          .from("locations")
          .select("id, name")
          .eq("organization_id", organization.id)
          .order("name", { ascending: true }),
      ]);

      if (managersRes.error) throw managersRes.error;
      if (locationsRes.error) throw locationsRes.error;

      setManagers((managersRes.data ?? []) as ManagerRow[]);
      setLocations((locationsRes.data ?? []) as LocationOption[]);
    } catch (error: any) {
      toast.error(error.message || "Não foi possível carregar os gerentes.");
    } finally {
      setLoading(false);
    }
  }, [organization?.id]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const handleAddManager = async () => {
    if (!organization?.id) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      toast.error("Informe um e-mail válido.");
      return;
    }
    if (!locationId) {
      toast.error("Selecione o ponto físico.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from("organization_barbers").insert({
        organization_id: organization.id,
        email: normalizedEmail,
        full_name: fullName.trim() || null,
        role: "manager",
        location_id: locationId,
        permissions,
      });

      if (error) throw error;

      toast.success(
        "Gerente adicionado. Envie o link de convite para ele criar a conta."
      );
      setDialogOpen(false);
      setEmail("");
      setFullName("");
      setLocationId("");
      setPermissions({ ...DEFAULT_MANAGER_PERMISSIONS });
      await fetchData();
    } catch (error: any) {
      toast.error(error.message || "Não foi possível adicionar o gerente.");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePermission = async (
    manager: ManagerRow,
    key: keyof ManagerPermissions,
    value: boolean
  ) => {
    const current = parseManagerPermissions(manager.permissions);
    const next = { ...current, [key]: value };

    const { error } = await supabase
      .from("organization_barbers")
      .update({ permissions: next })
      .eq("id", manager.id);

    if (error) {
      toast.error(error.message || "Não foi possível atualizar a permissão.");
      return;
    }

    setManagers((prev) =>
      prev.map((m) => (m.id === manager.id ? { ...m, permissions: next } : m))
    );
  };

  const handleChangeLocation = async (manager: ManagerRow, newLocationId: string) => {
    const { error } = await supabase
      .from("organization_barbers")
      .update({ location_id: newLocationId })
      .eq("id", manager.id);

    if (error) {
      toast.error(error.message || "Não foi possível alterar o ponto.");
      return;
    }

    setManagers((prev) =>
      prev.map((m) => (m.id === manager.id ? { ...m, location_id: newLocationId } : m))
    );
    toast.success("Ponto físico atualizado.");
  };

  const handleRemoveManager = async (manager: ManagerRow) => {
    const { error } = await supabase
      .from("organization_barbers")
      .delete()
      .eq("id", manager.id);

    if (error) {
      toast.error(error.message || "Não foi possível remover o gerente.");
      return;
    }

    toast.success("Gerente removido.");
    await fetchData();
  };

  const copyInviteLink = () => {
    if (!organization?.id) return;
    const link = `${window.location.origin}/barber/auth?org=${organization.id}`;
    void navigator.clipboard.writeText(link);
    toast.success("Link de convite copiado.");
  };

  const locationName = (id: string | null) =>
    locations.find((l) => l.id === id)?.name ?? "Sem ponto";

  const permissionKeys = Object.keys(
    MANAGER_PERMISSION_LABELS
  ) as (keyof ManagerPermissions)[];

  return (
    <section className="rounded-3xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Gerentes</h2>
          <p className="text-sm text-muted-foreground">
            Gerentes administram um ponto físico e aprovam reservas quando a
            confirmação automática está desativada.
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-2xl">
              <UserPlus className="mr-2 h-4 w-4" />
              Adicionar gerente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo gerente</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="manager-email">E-mail</Label>
                <Input
                  id="manager-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="gerente@email.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="manager-name">Nome (opcional)</Label>
                <Input
                  id="manager-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nome do gerente"
                />
              </div>

              <div className="space-y-2">
                <Label>Ponto físico</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o ponto" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Permissões</Label>
                {permissionKeys.map((key) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <span className="text-sm text-foreground">
                      {MANAGER_PERMISSION_LABELS[key]}
                    </span>
                    <Switch
                      checked={permissions[key]}
                      onCheckedChange={(checked) =>
                        setPermissions((prev) => ({ ...prev, [key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>

              <Button
                className="w-full rounded-2xl"
                onClick={handleAddManager}
                disabled={saving}
              >
                {saving ? "Salvando..." : "Adicionar gerente"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando gerentes...</p>
      ) : managers.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum gerente cadastrado ainda.
        </p>
      ) : (
        <div className="space-y-4">
          {managers.map((manager) => {
            const perms = parseManagerPermissions(manager.permissions);
            return (
              <div
                key={manager.id}
                className="rounded-2xl border border-border p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {manager.full_name || manager.email}
                    </p>
                    <p className="text-xs text-muted-foreground">{manager.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {manager.user_id
                        ? "Conta vinculada"
                        : "Aguardando criação da conta (envie o link de convite)"}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {!manager.user_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={copyInviteLink}
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />
                        Convite
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-destructive"
                      onClick={() => void handleRemoveManager(manager)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Ponto físico</Label>
                  <Select
                    value={manager.location_id ?? ""}
                    onValueChange={(v) => void handleChangeLocation(manager, v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={locationName(manager.location_id)} />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {permissionKeys.map((key) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-xl bg-secondary/50 px-3 py-2"
                    >
                      <span className="text-xs text-foreground">
                        {MANAGER_PERMISSION_LABELS[key]}
                      </span>
                      <Switch
                        checked={perms[key]}
                        onCheckedChange={(checked) =>
                          void handleTogglePermission(manager, key, checked)
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Renderizar no SettingsPage**

Em `src/pages/SettingsPage.tsx`, importar e renderizar `<ManagerUsersSection />` após as seções existentes (dentro do container principal da página).

```tsx
import ManagerUsersSection from "@/components/ManagerUsersSection";
// ... no JSX, após a última seção:
<ManagerUsersSection />
```

- [ ] **Step 3: Verificar build + commit**

Run: `npm run build`
Expected: sucesso.

```bash
git add src/components/ManagerUsersSection.tsx src/pages/SettingsPage.tsx
git commit -m "feat: manager user management in owner settings"
```

---

### Task 10: Verificação end-to-end

**Files:** nenhum (verificação manual + SQL)

- [ ] **Step 1: Testes automatizados + build**

Run: `npm run test && npm run build`
Expected: PASS + build ok.

- [ ] **Step 2: Verificação RLS via MCP Supabase**

Via `mcp__claude_ai_Supabase__execute_sql`, confirmar:

```sql
-- colunas existem
select column_name from information_schema.columns
where table_name = 'organization_barbers'
  and column_name in ('location_id', 'permissions');

-- policies criadas
select policyname, tablename from pg_policies
where policyname like 'manager_%';

-- funções criadas
select proname from pg_proc
where proname in ('is_location_manager', 'managed_location_id', 'manager_has_permission');
```

Expected: 2 colunas, ~10 policies `manager_*`, 3 funções.

- [ ] **Step 3: Fluxo manual (dev server)**

Run: `npm run dev`

1. Login como dono → Settings → seção "Gerentes" → adicionar gerente (email novo + ponto + permissões desligadas) → copiar convite
2. Aba anônima → abrir link de convite → criar conta com o email do gerente → deve redirecionar para `/manager/dashboard`
3. Confirmar: menu SEM "Cobranças" e "Financeiro" (permissões off)
4. Como dono: ligar `can_manage_payments` do gerente → gerente recarrega (logout/login ou refresh) → menu mostra "Cobranças"
5. Com `auto_confirm_bookings=false` na org: barbeiro faz reserva → gerente vê pendente em `/manager/bookings` → aprova → status confirmado
6. Confirmar isolamento: gerente acessando `/dashboard` (owner) é redirecionado; dados de outros pontos não aparecem
7. Registrar recebimento manual em "Cobranças" → histórico atualiza

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A
git commit -m "test: verify manager role end-to-end flow"
```
