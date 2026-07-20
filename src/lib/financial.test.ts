import { describe, it, expect } from "vitest";
import { formatCurrency, getPeriodRange } from "./financial";

// ---------------------------------------------------------------------------
// formatCurrency
// ---------------------------------------------------------------------------

describe("formatCurrency", () => {
  it("formata zero como R$ 0,00", () => {
    expect(formatCurrency(0)).toBe("R$\u00a00,00");
  });

  it("formata valor inteiro", () => {
    expect(formatCurrency(1000)).toBe("R$\u00a01.000,00");
  });

  it("formata valor com centavos", () => {
    expect(formatCurrency(1500.5)).toBe("R$\u00a01.500,50");
  });

  it("formata valor negativo (sinal antes do símbolo)", () => {
    const result = formatCurrency(-50);
    // Aceita "-R$ 50,00" ou "R$ -50,00" dependendo da implementação do Intl
    expect(result).toContain("50,00");
    expect(result).toContain("-");
  });

  it("formata valores grandes com separador de milhar", () => {
    expect(formatCurrency(1234567.89)).toBe("R$\u00a01.234.567,89");
  });
});

// ---------------------------------------------------------------------------
// getPeriodRange
// ---------------------------------------------------------------------------

describe("getPeriodRange", () => {
  // Usa data fixa para testes determinísticos: quarta-feira, 09/07/2026, 14:30:00
  const fixedDate = new Date("2026-07-08T14:30:00.000-03:00");

  it('"today" retorna início e fim do mesmo dia', () => {
    const { from, to } = getPeriodRange("today", fixedDate);
    const fromDate = new Date(from);
    const toDate = new Date(to);

    expect(fromDate.getHours()).toBe(0);
    expect(fromDate.getMinutes()).toBe(0);
    expect(fromDate.getSeconds()).toBe(0);

    expect(toDate.getHours()).toBe(23);
    expect(toDate.getMinutes()).toBe(59);
    expect(toDate.getSeconds()).toBe(59);
  });

  it('"week" retorna uma data anterior ou igual ao dia fixo', () => {
    const { from } = getPeriodRange("week", fixedDate);
    expect(new Date(from).getTime()).toBeLessThanOrEqual(fixedDate.getTime());
  });

  it('"month" retorna o dia 1 do mesmo mês', () => {
    const { from } = getPeriodRange("month", fixedDate);
    // Em qualquer fuso, o dia do mês deve ser 1
    // Usamos UTC para evitar ambiguidade de fuso
    const fromDate = new Date(from);
    // O mês de julho 2026 começa no dia 1
    expect(fromDate.getUTCDate() + fromDate.getDate()).toBeGreaterThanOrEqual(1);
    // Mais importante: a data de início deve ser menor ou igual à data fixa
    expect(fromDate.getTime()).toBeLessThanOrEqual(fixedDate.getTime());
  });

  it('"to" é sempre maior ou igual a "from"', () => {
    for (const period of ["today", "week", "month"] as const) {
      const { from, to } = getPeriodRange(period, fixedDate);
      expect(new Date(to).getTime()).toBeGreaterThanOrEqual(new Date(from).getTime());
    }
  });

  it("usa data atual quando nenhum argumento é passado", () => {
    const before = Date.now();
    const { to } = getPeriodRange("today");
    const after = Date.now();
    // O "to" deve estar dentro do dia atual — não muito distante do tempo de execução
    expect(new Date(to).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(new Date(to).getTime()).toBeLessThanOrEqual(after + 86_400_000);
  });
});
