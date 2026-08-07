---
name: future-features-roadmap
description: "Candidate future features for BarberHouse, prioritized by business impact"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2b390199-4aa4-4556-a7a0-54a56f5e6b8d
---

# Roadmap de features futuras — BarberHouse

Levantado em 2026-07-02. Prioridade do topo pra baixo. Ver estado atual em [[system-overview]].

## 🔴 Prioridade máxima (fura o dado fictício)

2. **Modelo de preço de aluguel** — contratos criam com `price=0` e `billing_cycle=monthly` fixos (defaults do trigger). Configurar preço por cadeira/ponto + ciclo (diário/semanal/mensal) e aplicar na reserva/contrato. Sem isso, financeiro e cobrança do gerente são fictícios.

## 🟠 Alta (operação/receita recorrente)
3. **Cobrança recorrente + renovação de contrato** — aluguel é recorrente; gerar fatura por ciclo, lembrete de vencimento, renovação/auto-renovação.
4. **Repasse/split** — se a org retém % do aluguel, calcular e exibir repasse ao barbeiro/dono.
5. **Contrato com e-sign real** — colunas `esign_status`/`esign_envelope_id` já existem mas são STUB. Assinatura digital (DocuSign/Clicksign) no aluguel.
6. **Visão de calendário/agenda** — reservas hoje são lista; grade semanal por cadeira/ponto mostrando ocupação e vagas.

## 🟡 Média (crescimento/retenção)
7. **Agendamento do cliente final** — sistema hoje é B2B (barbeiro aluga cadeira). Falta o CLIENTE final marcar corte com um barbeiro → portal público de agendamento. Feature GRANDE, novo público.
8. **Avaliações completas** — tabela `barber_ratings` existe mas fluxo mínimo. Cliente avalia após atendimento, média no perfil, ranking.
9. **Comissões/metas** — `check_ins` já tem `commission_amount/_type/_value`; dashboard de comissão e metas por barbeiro.
10. ~~**Fila de espera de cadeira**~~ — ✅ FEITO 2026-07-03 (branch ector-julho; spec docs/superpowers/specs/2026-07-03-chair-waitlist-design.md). Follow-ups menores anotados no ledger .superpowers/sdd/progress.md.

## 🟢 Engajamento / Analytics
11. **Notificações reais** — tabela `notifications` existe (só in-app). Adicionar push/email/WhatsApp (reserva aprovada, pagamento vencendo, contrato pra assinar).
12. **Dashboard de ocupação** — `vw_location_occupancy` já existe; gráficos de ocupação por ponto/período, barbeiro top, receita por ponto no tempo.

**Processo:** para qualquer uma dessas, entrar no fluxo de brainstorming (desenhar spec) antes de implementar. Lições de DB/RLS em [[tech-stack-and-canonical-db]] e [[rls-recursion-lessons]].



FUTURO:
- **Gateway de pagamento REAL** — hoje pix é simulado (`simulatePaymentConfirmation`, mock em `src/services/payments.ts`). Integrar Stripe / Mercado Pago / Asaas com webhook confirmando pagamento. Base de todo o financeiro real.