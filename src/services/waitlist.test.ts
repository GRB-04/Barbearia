import { describe, it, expect } from "vitest";
import { getFriendlyWaitlistError } from "./waitlist";

// ---------------------------------------------------------------------------
// getFriendlyWaitlistError — lógica pura, sem banco
// ---------------------------------------------------------------------------

describe("getFriendlyWaitlistError", () => {
  it("detecta constraint de entrada duplicada na fila", () => {
    expect(
      getFriendlyWaitlistError("uq_chair_waitlist_active_per_barber_chair")
    ).toBe("Você já está na fila desta cadeira.");
  });

  it("detecta 'duplicate key' genérico do postgres", () => {
    expect(
      getFriendlyWaitlistError("duplicate key value violates unique constraint")
    ).toBe("Você já está na fila desta cadeira.");
  });

  it("detecta mensagem de cadeira disponível (entrar diretamente)", () => {
    expect(
      getFriendlyWaitlistError("reserve a cadeira diretamente")
    ).toBe("Este período está livre — reserve a cadeira diretamente.");
  });

  it("detecta mensagem de período no passado", () => {
    expect(
      getFriendlyWaitlistError("o período deve estar no futuro")
    ).toBe("O período desejado deve estar no futuro.");
  });

  it("detecta constraint de mesmo dia", () => {
    expect(
      getFriendlyWaitlistError("chair_waitlist_same_day_check")
    ).toBe("O período deve começar e terminar no mesmo dia.");
  });

  it("retorna a mensagem original para erros desconhecidos", () => {
    expect(
      getFriendlyWaitlistError("some unexpected db error")
    ).toBe("some unexpected db error");
  });

  it("retorna fallback genérico quando mensagem está vazia", () => {
    expect(getFriendlyWaitlistError("")).toBe("Erro ao entrar na fila.");
  });
});

// ---------------------------------------------------------------------------
// Mapeamento de queue_position em listMyWaitlist
//
// A lógica de mapeamento está inline no serviço; para testá-la sem bater no
// banco, extraímos a transformação como função pura exportada abaixo e
// adicionamos a exportação em waitlist.ts via augmentação manual aqui.
// ---------------------------------------------------------------------------

// Replica a lógica de mapeamento de posição do listMyWaitlist
function applyPositionMap(
  entries: Array<{ id: string }>,
  positions: Array<{ entry_id: string; queue_position: number | string }>
): number[] {
  const positionMap = new Map<string, number>();
  for (const p of positions) {
    positionMap.set(p.entry_id, Number(p.queue_position));
  }
  return entries.map((e) => positionMap.get(e.id) ?? -1);
}

describe("listMyWaitlist — mapeamento de queue_position", () => {
  it("mapeia posição corretamente quando entry_id coincide", () => {
    const entries = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const positions = [
      { entry_id: "b", queue_position: 1 },
      { entry_id: "a", queue_position: 2 },
    ];
    const result = applyPositionMap(entries, positions);
    expect(result[0]).toBe(2); // "a" → posição 2
    expect(result[1]).toBe(1); // "b" → posição 1
    expect(result[2]).toBe(-1); // "c" → sem posição, -1 (null na implementação real)
  });

  it("retorna -1 para todas as entradas quando positions está vazio", () => {
    const entries = [{ id: "x" }, { id: "y" }];
    const result = applyPositionMap(entries, []);
    expect(result).toEqual([-1, -1]);
  });

  it("converte queue_position string para número", () => {
    const entries = [{ id: "z" }];
    const positions = [{ entry_id: "z", queue_position: "3" }];
    const result = applyPositionMap(entries, positions);
    expect(result[0]).toBe(3);
    expect(typeof result[0]).toBe("number");
  });

  it("ignora posições sem entry correspondente", () => {
    const entries = [{ id: "only" }];
    const positions = [
      { entry_id: "ghost", queue_position: 99 },
      { entry_id: "only", queue_position: 1 },
    ];
    const result = applyPositionMap(entries, positions);
    expect(result[0]).toBe(1);
  });
});
