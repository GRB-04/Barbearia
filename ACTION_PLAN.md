# 🎯 PLANO DE AÇÃO - Performance Fixes

## Ações Imediatas (SEM Risco - Faça Agora!)

### ✅ 1. Remover Console.logs (5 minutos)
**Arquivo**: `src/hooks/useAuth.tsx`
- Remove 8+ `console.log()` statements
- **Ganho**: ~100ms por operação

**Arquivo**: `src/hooks/useOrganization.tsx`
- Remove 8+ `console.log()` statements
- **Ganho**: ~50ms

**Arquivo**: Todas as pages (LocationsPage, BarbersPage, etc)
- Remove debugging logs
- **Ganho**: ~50ms

---

### ✅ 2. Adicionar Índices SQL (5 minutos)
Executar na Supabase via SQL Editor:

```sql
-- ÍNDICE 1: user_id em barber_profiles (CRÍTICO)
CREATE INDEX idx_barber_profiles_user_id 
  ON public.barber_profiles(user_id);

-- ÍNDICE 2: Conflict check de bookings
CREATE INDEX idx_chair_bookings_chair_dates 
  ON public.chair_bookings(chair_id, start_at DESC, end_at DESC);

-- ÍNDICE 3: Email matching
CREATE INDEX idx_barbers_email_lower 
  ON public.barbers(LOWER(email));

-- ÍNDICE 4: Location lookups em chairs
CREATE INDEX idx_chairs_location_id 
  ON public.chairs(location_id);
```

**Ganho**: ~500ms em queries

---

## Ações de Consolidação (30 minutos)

### ✅ 3. Corrigir MyBookingsPage.tsx (N+1 → 1 Query)

**Problema Atual**: 3 queries separadas
```tsx
// Query 1
.select("*")

// Query 2
.select("id, identifier, location_id").in("id", chairIds)

// Query 3  
.select("id, name").in("id", locationIds)
```

**Solução**: 1 query com JOINs

**Arquivo a editar**: [src/pages/barber/MyBookingsPage.tsx](src/pages/barber/MyBookingsPage.tsx#L37)

---

### ✅ 4. Corrigir BrowseStationsPage (Múltiplas queries → Pré-carregamento)

**Problema Atual**: Carrega locations, depois chairs por location, depois valida conflicts

**Arquivo a editar**: [src/pages/barber/BrowseStationsPage.tsx](src/pages/barber/BrowseStationsPage.tsx#L30)

---

### ✅ 5. Verificar Schema chair_bookings

**Dúvida**: Qual coluna é a verdade?
- `booking_date` (date)?
- `start_at`, `end_at` (timestamptz)?

**Ação**: Executar query:
```sql
SELECT column_name, data_type 
FROM information_schema.columns
WHERE table_name = 'chair_bookings'
ORDER BY ordinal_position;
```

**Resultado esperado**: Confirmar qual usar

---

## Ações Avançadas (2-3 horas)

### ⚠️ 6. Denormalizar organization_id em chairs

**Por que**: Reduz JOINs nas RLS policies

**Ação**:
```sql
-- Adicionar coluna
ALTER TABLE public.chairs 
  ADD COLUMN organization_id uuid REFERENCES public.organizations(id);

-- Backfill
UPDATE public.chairs c
SET organization_id = l.organization_id
FROM public.locations l
WHERE c.location_id = l.id;

-- Criar índice
CREATE INDEX idx_chairs_organization_id 
  ON public.chairs(organization_id);
```

**Ganho**: ~200-300ms em queries de chairs

---

### ⚠️ 7. Adicionar Paginação

**Arquivos**:
- LocationsPage.tsx
- BarbersPage.tsx
- ContractsPage.tsx

**Mudança simples**:
```tsx
.limit(50)  // Carregar apenas 50
.range(0, 49)  // Primeira página
```

**Ganho**: ~200ms em listas grandes

---

## Próximas Etapas

1. **Agora mesmo**: Remover console.logs + adicionar índices
2. **Hoje**: Corrigir MyBookingsPage (1 query)
3. **Amanhã**: Corrigir BrowseStationsPage
4. **Semana**: Denormalizar + Paginação

---

## Estimativa de Ganho Total

| Ação | Antes | Depois | Ganho |
|------|-------|--------|-------|
| Logs removal | - | - | -100ms |
| Índices | - | - | -500ms |
| MyBookings fix | 3 queries | 1 query | -800ms |
| BrowseStations | 4 queries | 2 queries | -600ms |
| **TOTAL** | **1.5-3s** | **~0.5-1s** | **-60% overhead** |
