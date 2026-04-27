# 🎬 PLANO DE AÇÃO ESTRUTURADO

**Objetivo**: Completar MVP F001-F012 seguindo os 4 documentos specs

---

## 🚨 FASE 0: BLOQUEADORES (2-3 dias)

### Tarefa 0.1: Decidir Modelo de Aluguel
**Impacto**: Todo o resto depende
**Opções**:
- A) Manter `contracts` (owner-managed) + deletar `chair_bookings`
- B) Manter `chair_bookings` (self-service) + deletar `contracts`
- C) Manter ambos com RLS separado

**Recomendação**: **B** (self-service é mais escalável)

**Ação**: Decidir em 24h, depois:
- [ ] Deletar tabela não usada
- [ ] Consolidar RLS policies
- [ ] Atualizar frontend

---

### Tarefa 0.2: Adicionar Horários de Funcionamento
**Relacionado**: F004, F009
**Bloqueador para**: F007, F009

**Schema**:
```sql
-- Opção 1: JSONB simples
ALTER TABLE locations ADD COLUMN operating_hours jsonb DEFAULT '{
  "0": {"open": "08:00", "close": null},  -- Domingo (fechado)
  "1": {"open": "08:00", "close": "18:00"},  -- Segunda
  "2": {"open": "08:00", "close": "18:00"},
  "3": {"open": "08:00", "close": "18:00"},
  "4": {"open": "08:00", "close": "22:00"},  -- Quinta
  "5": {"open": "08:00", "close": "22:00"},  -- Sexta
  "6": {"open": "08:00", "close": "22:00"}   -- Sábado
}';

-- Opção 2: Tabela de relacionamento
CREATE TABLE location_operating_hours (
  location_id uuid REFERENCES locations(id) ON DELETE CASCADE,
  day_of_week integer CHECK (day_of_week >= 0 AND day_of_week <= 6),
  open_time time,
  close_time time,
  PRIMARY KEY (location_id, day_of_week)
);
```

**Frontend**: UI para editar em LocationDetailPage

---

## 🟡 FASE 1: QUICK WINS (1 dia)

### 1.1: Remover console.logs
- [ ] useAuth.tsx
- [ ] useOrganization.tsx  
- [ ] pages/*

**Ganho**: +100-150ms por operação

### 1.2: Adicionar índices de FK faltando
```sql
CREATE INDEX idx_barber_profiles_organization_id 
  ON barber_profiles(organization_id);
CREATE INDEX idx_chair_assignments_barber_profile_id 
  ON chair_assignments(barber_profile_id);
CREATE INDEX idx_chair_assignments_organization_id 
  ON chair_assignments(organization_id);
CREATE INDEX idx_payments_organization_id 
  ON payments(organization_id);
```

**Ganho**: +200ms em queries

### 1.3: Consolidar N+1 Queries
- [ ] MyBookingsPage: 3 queries → 1 com JOINs
- [ ] BrowseStationsPage: 4 queries → 2 com pré-carga

**Ganho**: +800ms por operação

---

## 🟢 FASE 2: COMPLETAR MVP (2-3 semanas)

### Features Prontas para Completar (90%+)

**F006: Cadastro de Cadeiras** (+recursos)
- [ ] Adicionar campo `resources` (JSON: espelho, pia, etc)
- [ ] UI para selecionar recursos em LocationDetailPage
- **Esforço**: 2h

**F004: Locais** (+validações)
- [ ] Validações de horário já no place
- [ ] UI para gerenciar horários
- **Esforço**: 3h

### Features em Progresso (40-60%)

**F008: Uma Cadeira Ativa por Barbeiro**
- [ ] Verificação no frontend
- [ ] Mensagem de erro clara
- **Esforço**: 2h

**F007: Alocação com Validações**
- [ ] Validação: mínimo 4h
- [ ] Validação: dentro horário funcionamento
- **Esforço**: 3h

**F009: Prevenção de Conflito**
- [ ] Validação: horário dentro funcionamento ← BLOQUEADO por horários
- [ ] Testes de sobreposição
- **Esforço**: 2h

**F003: RBAC Completo**
- [ ] Adicionar perfil Gerente
- [ ] Adicionar perfil Recepção
- [ ] Interface de gestão de permissões
- **Esforço**: 5h

**F005: Capacidade de Cadeiras**
- [ ] DB: coluna `capacity` em locations
- [ ] Validação: max 5 cadeiras
- [ ] UI: limite durante criação
- **Esforço**: 3h

### Features Não Iniciadas (Bonus, pós-MVP)

**F010, F011, F012**: Check-in, Duração, Clientes
- Dificuldade: Média
- **Esforço**: 13 story points

---

## 📅 TIMELINE PROPOSTO

### SEMANA 1 (Hoje - 14/04)
- [ ] Décida modelo de aluguel (1 dia)
- [ ] Implemente horários (1 dia)
- [ ] Remova console.logs (1h)
- [ ] Crie índices FK (15 min)
- [ ] Consolide N+1 queries (4-6h)
- **Status Esperado**: ~55-60% completo

### SEMANA 2 (15/04 - 21/04)
- [ ] Completa F006, F004 com validações (+recursos, horários)
- [ ] Completa F008, F007, F009 (validações)
- [ ] Inicia F003 (RBAC completo)
- **Status Esperado**: ~75% completo

### SEMANA 3 (22/04 - 28/04)
- [ ] Completa F003, F005
- [ ] Testes e polishing
- [ ] Pronto para produção MVP
- **Status Esperado**: 100% F001-F009 + F003

### SEMANA 4+ (Bonus Features)
- [ ] F010, F011, F012 (Check-in, Duração, Clientes)

---

## 📋 PRÓXIMA AÇÃO IMEDIATA

**Você precisa decidir em 24h**:

### Opção A: Contracts (Owner-Managed)
```
Owner aluga cadeira para barbeiro
Melhor para: Donos que controlam tudo
Desvantagem: Não escala bem
```

### Opção B: Chair_bookings (Self-Service) ← RECOMENDAÇÃO
```
Barbeiro aluga cadeira para si
Melhor para: Libertade/escalabilidade
Desvantagem: Menos controle imediato
```

### Opção C: Híbrido
```
Manter ambas
Desvantagem: Duplicação, bugs
NÃO RECOMENDADO
```

**Qual escolher?** 👇
