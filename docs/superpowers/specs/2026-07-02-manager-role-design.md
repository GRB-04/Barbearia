# Design: Role de Gerente por Ponto Fisico

**Data:** 2026-07-02  
**Status:** Draft

---

## Context

O dono da organizacao precisa de um intermediario entre ele e os barbeiros em cada ponto fisico.
Hoje o sistema tem so dois roles: `owner` (acessa portal `/`) e `barber` (acessa portal `/barber/*`).
O gerente vai gerenciar o dia a dia de um ponto especifico: aprovar reservas quando auto-confirm esta desativado, cobrar pagamentos de aluguel, gerenciar cadeiras, e convidar novos barbeiros.

O dono configura as permissoes opcionais de cada gerente individualmente.

---

## Decisoes de Design

| Decisao | Escolha |
|---------|---------|
| Escopo do gerente | Um ponto fisico fixo por gerente |
| Portal | `/manager/*` (proprio, separado) |
| Onboarding | Mesmo invite flow do barbeiro (`/barber/auth?org=xxx`) |
| Role enum | Ja existe: `manager` em `app_role` |
| Aprovacao de reservas | Quando auto_confirm=false, dono OU gerente do ponto podem aprovar |

---

## Arquitetura

### Mudancas no Banco (Supabase)

**1. Coluna `location_id` em `organization_barbers`**  
Nullable. Quando `role='manager'`, obrigatório. Vincula gerente ao ponto fisico.

```sql
ALTER TABLE organization_barbers
  ADD COLUMN location_id UUID REFERENCES locations(id) ON DELETE SET NULL;
```

**2. Coluna `permissions` em `organization_barbers`**  
JSONB com permissoes opcionais do gerente. So usado quando `role='manager'`.

```sql
ALTER TABLE organization_barbers
  ADD COLUMN permissions JSONB DEFAULT '{}'::jsonb;
```

Estrutura do JSONB:
```json
{
  "can_manage_payments": false,
  "can_edit_chairs": false,
  "can_view_financials": false,
  "can_invite_barbers": false
}
```

**3. RLS Policies novas (manager)**

Para cada recurso, adicionar policy que permite acesso se:
- `auth.uid()` tem `role='manager'` em `organization_barbers` para aquela `organization_id`
- `location_id` do gerente bate com o recurso acessado

Recursos afetados: `chair_bookings`, `contracts`, `chairs`, `locations`, `barber_profiles` (read-only para ver barbeiros do ponto).

**4. Auto-confirm simplificado**

Manter `auto_confirm_bookings` em nivel de `organizations`. Quando `false`:
- Dono ve e aprova TODOS os pontos
- Gerente ve e aprova SO o seu ponto

Remover ou deprecar `auto_confirm_bookings` no nivel de `locations` para simplificar.  
*(A logica atual usa COALESCE entre os dois — vai manter compatibilidade enquanto migra.)*

---

## Permissoes

### Fixas (todos os gerentes sempre tem)
| Permissao | Descricao |
|-----------|-----------|
| Ver barbeiros do ponto | Lista de barbeiros vinculados ao ponto |
| Ver contratos do ponto | Contratos ativos/encerrados das cadeiras do ponto |
| Ver cadeiras e status | Status de cada cadeira do ponto |
| Aprovar/rejeitar reservas | Quando org.auto_confirm_bookings = false |

### Opcionais (dono ativa por gerente)
| Chave JSON | Descricao |
|------------|-----------|
| `can_manage_payments` | Controle completo de cobranca: ver pendentes, registrar recebimento, gerar comprovante |
| `can_edit_chairs` | Alterar status de cadeiras, adicionar/remover cadeiras |
| `can_view_financials` | Relatorio financeiro do ponto (receita, inadimplencia) |
| `can_invite_barbers` | Enviar link de convite para novos barbeiros no ponto |

---

## Fluxo de Onboarding do Gerente

1. Dono vai em **Configuracoes > Usuarios** no portal do dono
2. Clica "Adicionar Gerente"
3. Seleciona: ponto fisico + email do gerente + permissoes opcionais
4. Sistema cria entrada em `organization_barbers` com `role='manager'`, `location_id`, `permissions`
5. Dono copia link de convite (mesmo padrao: `/barber/auth?org={org_id}`)
6. Gerente abre link, cria conta (email/senha)
7. `claim_barber_invitation()` detecta email na tabela → vincula conta. **A funcao deve preservar o `role` pre-existente** (`manager`) em vez de sobrescrever para `barber` (checar/corrigir funcao SQL existente)
8. App.tsx detecta role='manager' → redireciona para `/manager/dashboard`

---

## Portal do Gerente (`/manager/*`)

### Rotas
| Rota | Descricao |
|------|-----------|
| `/manager/dashboard` | Visao geral do ponto (cadeiras, reservas pendentes, alertas) |
| `/manager/bookings` | Aprovar/rejeitar reservas pendentes do ponto |
| `/manager/barbers` | Ver barbeiros do ponto |
| `/manager/contracts` | Ver contratos do ponto |
| `/manager/payments` | (se `can_manage_payments`) Cobrancas pendentes, historico, registrar recebimento |
| `/manager/chairs` | (se `can_edit_chairs`) Gerenciar cadeiras do ponto |
| `/manager/financials` | (se `can_view_financials`) Relatorio financeiro do ponto |

### Hooks novos
- `useManagerProfile()` — similar ao `useBarberProfile()`. Busca `organization_barbers` WHERE `user_id = auth.uid() AND role='manager'`. Retorna ponto vinculado + permissions JSONB.

### Modificacoes no App.tsx
- Adicionar deteccao de role apos login: se `role='manager'` → redireciona `/manager/*`
- Proteger rotas `/manager/*` com guard que exige role='manager'
- Proteger rotas `/` (owner) para que gerente nao acesse

---

## Portal do Dono — Modificacoes

### SettingsPage: nova aba "Usuarios"
- Lista de gerentes por ponto fisico
- Botao "Adicionar Gerente" → modal: email + ponto + permissoes (toggles)
- Editar permissoes de gerentes existentes
- Remover gerente

### BookingsPage: filtrar por location
- Quando dono aprova reservas, pode ver por ponto fisico
- (Nao muda o acesso do dono — ele continua vendo tudo)

---

## Verificacao / Teste

1. **Criar gerente:** Dono adiciona gerente em Settings, recebe link de convite
2. **Onboarding:** Gerente abre link, cria conta, e redirecionado para `/manager/dashboard`
3. **Permissoes fixas:** Gerente ve reservas pendentes, contratos, barbeiros, cadeiras do SEU ponto; nao acessa dados de outros pontos
4. **Permissoes opcionais desativadas:** Menu de pagamentos/financeiro nao aparece
5. **Permissoes opcionais ativadas:** Dono ativa `can_manage_payments` → gerente ve menu de cobrancas
6. **Aprovacao de reserva:** Com `auto_confirm=false`, barbeiro faz reserva → gerente ve pendente → aprova/rejeita
7. **Isolamento:** Gerente nao consegue acessar rotas `/` (owner portal)
8. **RLS:** Query direta no Supabase confirma que gerente so ve dados do seu `location_id`
