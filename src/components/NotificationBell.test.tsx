import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import NotificationBell from "./NotificationBell";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// useAuth — retorna um usuário fixo por padrão
vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({ user: { id: "user-test-001" } })),
}));

// Supabase — mock com canal de realtime no-op
vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };

  const selectBuilder = vi.fn();
  const updateBuilder = vi.fn();

  const fromBuilder = {
    select: selectBuilder,
    update: updateBuilder,
  };

  return {
    supabase: {
      from: vi.fn(() => fromBuilder),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
      // Expõe para os testes
      __mocks: { selectBuilder, updateBuilder, channel },
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getSupabaseMocks() {
  const mod = await import("@/integrations/supabase/client");
  return (mod.supabase as any).__mocks as {
    selectBuilder: ReturnType<typeof vi.fn>;
    updateBuilder: ReturnType<typeof vi.fn>;
    channel: { on: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> };
  };
}

async function useAuthMock() {
  const mod = await import("@/hooks/useAuth");
  return mod.useAuth as ReturnType<typeof vi.fn>;
}

/** Cria uma notificação de teste com valores padrão. */
function makeNotification(overrides: Partial<{
  id: string;
  title: string;
  body: string | null;
  type: string;
  read_at: string | null;
  created_at: string;
}> = {}) {
  return {
    id: "notif-001",
    title: "Reserva confirmada",
    body: "Sua cadeira foi reservada.",
    type: "contract",
    read_at: null,
    created_at: "2026-07-08T10:00:00Z",
    ...overrides,
  };
}

/** Configura o mock do supabase.from().select() para retornar notificações. */
async function mockFetchNotifications(notifications: ReturnType<typeof makeNotification>[]) {
  const mocks = await getSupabaseMocks();
  mocks.selectBuilder.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      order: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue({ data: notifications, error: null }),
      }),
    }),
  });
}

async function mockUpdateNotification() {
  const mocks = await getSupabaseMocks();
  mocks.updateBuilder.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      is: vi.fn().mockResolvedValue({ error: null }),
      // markOneRead usa .eq(id)
    }),
  });
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renderiza o botão da campainha", async () => {
    await mockFetchNotifications([]);
    await act(async () => {
      render(<NotificationBell />);
    });
    expect(screen.getByLabelText("Notificações")).toBeInTheDocument();
  });

  it("NÃO exibe badge quando não há notificações não lidas", async () => {
    await mockFetchNotifications([
      makeNotification({ read_at: "2026-07-08T11:00:00Z" }),
    ]);

    render(<NotificationBell />);

    // Abre o dropdown para acionar o fetch
    fireEvent.click(screen.getByLabelText("Notificações"));

    await waitFor(() => {
      // Badge só aparece com unreadCount > 0
      expect(screen.queryByText(/^\d+$|^9\+$/)).not.toBeInTheDocument();
    });
  });

  it("exibe badge com contagem correta de não lidas", async () => {
    await mockFetchNotifications([
      makeNotification({ id: "n1", read_at: null }),
      makeNotification({ id: "n2", read_at: null }),
      makeNotification({ id: "n3", read_at: "2026-07-08T11:00:00Z" }),
    ]);

    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("Notificações"));

    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("exibe '9+' quando há mais de 9 notificações não lidas", async () => {
    const manyUnread = Array.from({ length: 12 }, (_, i) =>
      makeNotification({ id: `n${i}`, read_at: null })
    );
    await mockFetchNotifications(manyUnread);

    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("Notificações"));

    await waitFor(() => {
      expect(screen.getByText("9+")).toBeInTheDocument();
    });
  });

  it("clicar na campainha abre o dropdown com título 'Notificações'", async () => {
    await mockFetchNotifications([]);
    render(<NotificationBell />);

    fireEvent.click(screen.getByLabelText("Notificações"));

    await waitFor(() => {
      expect(screen.getByText("Notificações")).toBeInTheDocument();
    });
  });

  it("exibe estado vazio quando não há notificações", async () => {
    await mockFetchNotifications([]);
    render(<NotificationBell />);

    fireEvent.click(screen.getByLabelText("Notificações"));

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma notificação ainda/i)).toBeInTheDocument();
    });
  });

  it("exibe a lista de notificações com títulos", async () => {
    await mockFetchNotifications([
      makeNotification({ id: "n1", title: "Reserva aprovada" }),
      makeNotification({ id: "n2", title: "Check-in registrado" }),
    ]);

    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("Notificações"));

    await waitFor(() => {
      expect(screen.getByText("Reserva aprovada")).toBeInTheDocument();
      expect(screen.getByText("Check-in registrado")).toBeInTheDocument();
    });
  });

  it("botão 'Marcar tudo como lido' aparece apenas quando há não lidas", async () => {
    await mockFetchNotifications([
      makeNotification({ id: "n1", read_at: null }),
    ]);

    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("Notificações"));

    await waitFor(() => {
      expect(screen.getByText(/Marcar tudo como lido/i)).toBeInTheDocument();
    });
  });

  it("botão 'Marcar tudo como lido' NÃO aparece quando tudo já foi lido", async () => {
    await mockFetchNotifications([
      makeNotification({ id: "n1", read_at: "2026-07-08T11:00:00Z" }),
    ]);

    render(<NotificationBell />);
    fireEvent.click(screen.getByLabelText("Notificações"));

    await waitFor(() => {
      expect(screen.queryByText(/Marcar tudo como lido/i)).not.toBeInTheDocument();
    });
  });

  it("não renderiza nada de especial quando usuário é null", async () => {
    const useAuth = await useAuthMock();
    useAuth.mockReturnValue({ user: null });

    await act(async () => {
      render(<NotificationBell />);
    });

    // Campainha renderiza, mas sem badge
    expect(screen.getByLabelText("Notificações")).toBeInTheDocument();
    expect(screen.queryByText(/9\+|\d/)).not.toBeInTheDocument();
  });
});
