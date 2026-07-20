import { startOfDay, startOfWeek, startOfMonth, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export type Period = "today" | "week" | "month";

/**
 * Formata um valor numérico como moeda brasileira (BRL).
 * Ex.: 1500.5 → "R$ 1.500,50"
 */
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Retorna o intervalo [from, to] para um período relativo ao momento atual.
 * - "today"  → início do dia até fim do dia
 * - "week"   → início da semana (domingo, locale pt-BR) até fim do dia
 * - "month"  → dia 1 do mês até fim do dia
 */
export function getPeriodRange(
  period: Period,
  now: Date = new Date()
): { from: string; to: string } {
  let from: Date;

  if (period === "today") from = startOfDay(now);
  else if (period === "week") from = startOfWeek(now, { locale: ptBR });
  else from = startOfMonth(now);

  return {
    from: from.toISOString(),
    to: endOfDay(now).toISOString(),
  };
}

export const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  week: "Esta semana",
  month: "Este mês",
};
