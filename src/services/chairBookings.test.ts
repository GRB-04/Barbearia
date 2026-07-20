import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveEffectiveAutoConfirm,
  checkBarberAvailability,
} from "./chairBookings";

// ---------------------------------------------------------------------------
// 1. resolveEffectiveAutoConfirm — lógica pura, sem banco
// ---------------------------------------------------------------------------

describe("resolveEffectiveAutoConfirm", () => {
  describe("quando não há override de unidade (locationOverride = null)", () => {
    it("org=true  → confirmed", () => {
      expect(resolveEffectiveAutoConfirm(true, null)).toBe("confirmed");
    });

    it("org=false → pending", () => {
      expect(resolveEffectiveAutoConfirm(false, null)).toBe("pending");
    });
  });

  describe("quando a unidade sobrescreve a org", () => {
    it("org=false, location=true  → confirmed (override liga)", () => {
      expect(resolveEffectiveAutoConfirm(false, true)).toBe("confirmed");
    });

    it("org=true,  location=false → pending  (override desliga)", () => {
      expect(resolveEffectiveAutoConfirm(true, false)).toBe("pending");
    });

    it("org=true,  location=true  → confirmed", () => {
      expect(resolveEffectiveAutoConfirm(true, true)).toBe("confirmed");
    });

    it("org=false, location=false → pending", () => {
      expect(resolveEffectiveAutoConfirm(false, false)).toBe("pending");
    });
  });
});

// ---------------------------------------------------------------------------
// 2. checkBarberAvailability — testa a lógica de overlap via mock do Supabase
// ---------------------------------------------------------------------------

// Mock do módulo inteiro do Supabase para evitar chamadas de rede
vi.mock("@/integrations/supabase/client", () => {
  // Builder fluente: cada método retorna `this` até .limit() resolver a promise
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => builder,
    lt: () => builder,
    gt: () => builder,
    limit: vi.fn(),
  };

  const authBuilder = {
    getUser: vi.fn(),
  };

  return {
    supabase: {
      auth: authBuilder,
      from: vi.fn(() => builder),
      // Expõe os builders para que os testes possam inspecioná-los
      _builder: builder,
      _auth: authBuilder,
    },
  };
});

// Helper: simula um barber_profile_id fixo para getCurrentBarberProfileId()
async function mockAuthAndProfile(supabase: any, fakeProfileId = "barber-123") {
  supabase.auth.getUser.mockResolvedValue({
    data: { user: { id: "user-abc" } },
    error: null,
  });

  // Primeira chamada de .from() é para barber_profiles (dentro de getCurrentBarberProfileId)
  // Segunda chamada é para chair_bookings (dentro de checkBarberAvailability)
  supabase.from
    .mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: fakeProfileId }, error: null }),
        }),
      }),
    }));
}

describe("checkBarberAvailability", () => {
  let supabase: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("@/integrations/supabase/client");
    supabase = mod.supabase;
  });

  it("retorna true quando não há reservas conflitantes", async () => {
    await mockAuthAndProfile(supabase);

    // Segunda chamada: chair_bookings retorna lista vazia → sem conflito
    supabase.from.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            lt: () => ({
              gt: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    }));

    const available = await checkBarberAvailability(
      "2026-07-10T09:00:00Z",
      "2026-07-10T13:00:00Z"
    );

    expect(available).toBe(true);
  });

  it("retorna false quando há sobreposição de reserva ativa", async () => {
    await mockAuthAndProfile(supabase);

    // Segunda chamada: chair_bookings retorna 1 booking → conflito
    supabase.from.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            lt: () => ({
              gt: () => ({
                limit: async () => ({
                  data: [{ id: "existing-booking" }],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      }),
    }));

    const available = await checkBarberAvailability(
      "2026-07-10T09:00:00Z",
      "2026-07-10T13:00:00Z"
    );

    expect(available).toBe(false);
  });

  it("lança erro quando o usuário não está autenticado", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      checkBarberAvailability("2026-07-10T09:00:00Z", "2026-07-10T13:00:00Z")
    ).rejects.toThrow("Usuário não autenticado.");
  });

  it("lança erro quando o perfil do barbeiro não existe", async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: "user-abc" } },
      error: null,
    });

    supabase.from.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: { message: "Not found" } }),
        }),
      }),
    }));

    await expect(
      checkBarberAvailability("2026-07-10T09:00:00Z", "2026-07-10T13:00:00Z")
    ).rejects.toThrow("Perfil do barbeiro não encontrado.");
  });
});
