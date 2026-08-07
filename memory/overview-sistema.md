---
name: system-overview
description: "What the Barbearia/BarberHouse system is, the pain it solves, business model, and user types"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2b390199-4aa4-4556-a7a0-54a56f5e6b8d
---

# BarberHouse — visão geral do sistema

**O que é:** SaaS de barbearia moderna baseado em **aluguel de cadeiras**. Não é agendamento de cortes para clientes finais (ainda). O produto conecta donos de espaço físico com barbeiros autônomos que alugam cadeiras.

**Dor que resolve:** o dono do app (cliente do desenvolvedor) aluga pontos físicos, coloca N cadeiras em cada ponto, e barbeiros autônomos alugam essas cadeiras por período. O sistema gerencia pontos, cadeiras, reservas, contratos de aluguel, pagamentos e agora gerentes intermediários.

**Modelo de negócio / hierarquia:**
```
organization (dono do app / empresa)
  └── locations (pontos físicos alugados)
        └── chairs (cadeiras, capacidade 1–50 por ponto)
              └── chair_bookings (reserva/aluguel de cadeira por barbeiro)
                    └── contracts (contrato 1:1 com a reserva confirmada)

barber_profiles (conta global do barbeiro)
  └── organization_barbers (vínculo do barbeiro/gerente com a org; roster)
```

**Multi-tenant:** hoje só UMA organização em uso (o cliente do dev). Mas a arquitetura suporta várias organizações — cada empresa poderia comprar sua própria org e alugar para vários barbeiros.

**Três tipos de login/portal:**
- **Dono (owner)** — `/auth` → portal `/` (dashboard, locais, cadeiras, barbeiros, reservas, contratos, financeiro, auditoria, configurações, gerentes)
- **Barbeiro (barber)** — `/barber/auth` → portal `/barber/*` (explorar cadeiras, reservar, minhas reservas, contratos, ganhos, clientes, check-in, pagamento)
- **Gerente (manager)** — entra pelo mesmo convite de barbeiro mas cai em `/manager/*` — ver [[manager-role-feature]]

**Regras de negócio detalhadas:** ver [[business-rules]].
**Stack e banco:** ver [[tech-stack-and-canonical-db]].

**Estado do produto (2026-07-02):** pagamentos são SIMULADOS (mock pix, sem gateway real). Preço de aluguel de contrato ainda é fictício (price=0, ciclo mensal fixo). E-sign de contrato é stub. Próximas features de maior impacto: gateway de pagamento real + modelo de preço de aluguel real.
