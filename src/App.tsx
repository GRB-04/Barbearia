import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrgProvider, useOrganization } from "@/hooks/useOrganization";
import {
  BarberProfileProvider,
  useBarberProfile,
} from "@/hooks/useBarberProfile";

import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import AppLayout from "./components/AppLayout";
import BarberLayout from "./components/BarberLayout";
import ConsentBanner from "./components/ConsentBanner";

import OwnerDashboardPage from "./pages/OwnerDashboardPage";
import LocationsPage from "./pages/LocationsPage";
import LocationDetailPage from "./pages/LocationDetailPage";
import BarbersPage from "./pages/BarbersPage";
import ContractsPage from "./pages/ContractsPage";
import FinancialReportPage from "./pages/FinancialReportPage";
import SettingsPage from "./pages/SettingsPage";
import AuditLogPage from "./pages/AuditLogPage";

import BarberAuthPage from "./pages/barber/BarberAuthPage";
import BarberDashboard from "./pages/barber/BarberDashboard";
import MyContractsPage from "./pages/barber/MyContractsPage";
import MyBookingsPage from "./pages/barber/MyBookingsPage";
import ClientsPage from "./pages/barber/ClientsPage";
import CheckInPage from "./pages/barber/CheckInPage";
import ClientHistoryPage from "./pages/barber/ClientHistoryPage";
import ExplorePage from "./pages/barber/ExplorePage";
import PaymentPage from "./pages/barber/PaymentPage";
import EarningsPage from "./pages/barber/EarningsPage";

import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function LoadingScreen({
  title = "Carregando...",
  description = "O sistema está inicializando os dados da sessão.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex flex-col items-center justify-center space-y-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    </div>
  );
}

function BarberAccessMissingScreen() {
  const { signOut } = useAuth();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm space-y-4">
        <h1 className="text-lg font-semibold text-foreground">
          Conta não vinculada a uma barbearia
        </h1>

        <p className="text-sm text-muted-foreground">
          Seu login foi criado, mas ainda não está vinculado a nenhuma barbearia.
        </p>

        <p className="text-sm text-muted-foreground">
          Peça ao dono da barbearia para cadastrar você na lista de barbeiros e enviar o <strong>link de convite</strong>. Ao acessar o link, o vínculo será feito automaticamente.
        </p>

        <button
          onClick={() => void signOut()}
          className="mt-2 text-sm text-primary hover:underline"
        >
          Sair da conta
        </button>
      </div>
    </div>
  );
}

function OwnerRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { organization, loading: orgLoading } = useOrganization();
  const { barberProfile, barber, loading: barberLoading } = useBarberProfile();

  if (authLoading || barberLoading) {
    return (
      <LoadingScreen description="Estamos verificando autenticação e perfil do usuário." />
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  const isOwner = !!organization && organization.owner_id === user.id;
  const isOperationalBarber = !!barberProfile && !!barber;

  if (isOperationalBarber && !isOwner) {
    return <Navigate to="/barber/dashboard" replace />;
  }

  if (orgLoading) {
    return (
      <LoadingScreen description="Estamos carregando a organização do owner." />
    );
  }

  if (!isOwner) {
    return <OnboardingPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<OwnerDashboardPage />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="locations/:id" element={<LocationDetailPage />} />
        <Route path="barbers" element={<BarbersPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="financial" element={<FinancialReportPage />} />
        <Route path="audit" element={<AuditLogPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function BarberRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { organization } = useOrganization();
  const { barberProfile, barber, loading: barberLoading } = useBarberProfile();

  if (authLoading || barberLoading) {
    return (
      <LoadingScreen description="Estamos carregando o acesso do barbeiro." />
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="auth" element={<BarberAuthPage />} />
        <Route path="*" element={<Navigate to="/barber/auth" replace />} />
      </Routes>
    );
  }

  const isOwner = !!organization && organization.owner_id === user.id;
  const hasBarberProfile = !!barberProfile;
  const hasOperationalBarber = !!barber;

  if (isOwner && !hasBarberProfile && !hasOperationalBarber) {
    return <Navigate to="/locations" replace />;
  }

  if (!hasBarberProfile) {
    return (
      <Routes>
        <Route path="auth" element={<BarberAuthPage />} />
        <Route path="*" element={<Navigate to="/barber/auth" replace />} />
      </Routes>
    );
  }

  // Allow freelancers to enter even without a specific organization link
  // They will see a limited dashboard but can still explore and book chairs.
  if (!hasOperationalBarber) {
    // We can still show a notice on the dashboard itself, but don't block access to the whole /barber/* app.
  }

  return (
    <Routes>
      <Route
        path="auth"
        element={<BarberAuthPage />}
      />

      <Route path="/" element={<BarberLayout />}>
        <Route index element={<Navigate to="/barber/dashboard" replace />} />
        <Route path="dashboard" element={<BarberDashboard />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="contracts" element={<MyContractsPage />} />
        <Route path="my-bookings" element={<MyBookingsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route
          path="clients/:clientId/history"
          element={<ClientHistoryPage />}
        />
        <Route path="checkin" element={<CheckInPage />} />
        <Route path="earnings" element={<EarningsPage />} />
        <Route path="payment/:bookingId" element={<PaymentPage />} />
        <Route path="*" element={<Navigate to="/barber/dashboard" replace />} />
      </Route>
    </Routes>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AuthProvider>
            <OrgProvider>
              <BarberProfileProvider>
                <Routes>
                  <Route path="/barber/*" element={<BarberRoutes />} />
                  <Route path="/*" element={<OwnerRoutes />} />
                </Routes>
                <ConsentBanner />
              </BarberProfileProvider>
            </OrgProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;