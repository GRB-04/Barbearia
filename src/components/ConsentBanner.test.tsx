import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConsentBanner from "./ConsentBanner";

// ---------------------------------------------------------------------------
// Mock do Supabase — factory inline (vi.mock é hoisted, não pode referenciar
// variáveis externas; usamos vi.fn() aqui e acessamos via módulo depois)
// ---------------------------------------------------------------------------

vi.mock("@/integrations/supabase/client", () => {
  const maybeSingle = vi.fn();
  const insert = vi.fn();
  const getSession = vi.fn();

  return {
    supabase: {
      auth: { getSession },
      from: vi.fn(() => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle }),
          }),
        }),
        insert,
      })),
      // Expõe os fns para que os testes consigam inspecioná-los
      __mocks: { maybeSingle, insert, getSession },
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONSENT_KEY = "barber_lgpd_consent_v1";

async function getSupabaseMocks() {
  const mod = await import("@/integrations/supabase/client");
  return (mod.supabase as any).__mocks as {
    maybeSingle: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    getSession: ReturnType<typeof vi.fn>;
  };
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("ConsentBanner", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    localStorage.clear();

    const mocks = await getSupabaseMocks();
    // Padrão: sem sessão, sem consentimento no banco
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    mocks.maybeSingle.mockResolvedValue({ data: null });
    mocks.insert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("exibe o banner quando não há consentimento no localStorage", async () => {
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Privacidade e proteção de dados/i)).toBeInTheDocument();
    });
  });

  it("NÃO exibe o banner quando localStorage já tem consentimento", async () => {
    localStorage.setItem(CONSENT_KEY, new Date().toISOString());

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(
        screen.queryByText(/Privacidade e proteção de dados/i)
      ).not.toBeInTheDocument();
    });
  });

  it("NÃO exibe o banner quando usuário logado já consentiu no banco", async () => {
    const mocks = await getSupabaseMocks();
    mocks.getSession.mockResolvedValue({
      data: {
        session: { user: { id: "user-001" }, access_token: "tok_abc" },
      },
    });
    mocks.maybeSingle.mockResolvedValue({ data: { id: "consent-001" } });

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(
        screen.queryByText(/Privacidade e proteção de dados/i)
      ).not.toBeInTheDocument();
    });
  });

  it("clicar 'Aceitar e continuar' salva no localStorage e esconde o banner", async () => {
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Aceitar e continuar/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Aceitar e continuar/i));

    await waitFor(() => {
      expect(
        screen.queryByText(/Privacidade e proteção de dados/i)
      ).not.toBeInTheDocument();
      expect(localStorage.getItem(CONSENT_KEY)).not.toBeNull();
    });
  });

  it("clicar 'Aceitar' chama insert() com user_id e consent_type quando há sessão", async () => {
    const mocks = await getSupabaseMocks();
    mocks.getSession.mockResolvedValue({
      data: {
        session: { user: { id: "user-abc" }, access_token: "xyz_TOKEN_HERE" },
      },
    });

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Aceitar e continuar/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Aceitar e continuar/i));

    await waitFor(() => {
      expect(mocks.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: "user-abc",
          consent_type: "lgpd_v1",
        })
      );
    });
  });

  it("clicar 'Fechar' (X) marca como dismissed e esconde o banner", async () => {
    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByLabelText("Fechar")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText("Fechar"));

    await waitFor(() => {
      expect(
        screen.queryByText(/Privacidade e proteção de dados/i)
      ).not.toBeInTheDocument();
      expect(localStorage.getItem(CONSENT_KEY)).toBe("dismissed");
    });
  });

  it("erro no banco: salva no localStorage como fallback e esconde o banner", async () => {
    const mocks = await getSupabaseMocks();
    mocks.getSession.mockResolvedValue({
      data: {
        session: { user: { id: "user-abc" }, access_token: "tok" },
      },
    });
    mocks.insert.mockRejectedValue(new Error("DB offline"));

    render(<ConsentBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Aceitar e continuar/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Aceitar e continuar/i));

    await waitFor(() => {
      expect(
        screen.queryByText(/Privacidade e proteção de dados/i)
      ).not.toBeInTheDocument();
      expect(localStorage.getItem(CONSENT_KEY)).not.toBeNull();
    });
  });
});
