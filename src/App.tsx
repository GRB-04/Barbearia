import { lazy, Suspense } from "react";
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

// Static imports — always needed on first paint
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import AppLayout from "./components/AppLayout";
import BarberLayout from "./components/BarberLayout";
import ManagerLayout from "./components/ManagerLayout";
import ConsentBanner from "./components/ConsentBanner";
import NotFound from "./pages/NotFound";
import BarberAuthPage from "./pages/barber/BarberAuthPage";
import AccessGatePage from "./pages/AccessGatePage";

// Owner portal — lazy loaded
const OwnerDashboardPage  = lazy(() => import("./pages/OwnerDashboardPage"));
const LocationsPage       = lazy(() => import("./pages/LocationsPage"));
const LocationDetailPage  = lazy(() => import("./pages/LocationDetailPage"));
const BarbersPage         = lazy(() => import("./pages/BarbersPage"));
const BookingsPage        = lazy(() => import("./pages/BookingsPage"));
const ContractsPage       = lazy(() => import("./pages/ContractsPage"));
const FinancialReportPage = lazy(() => import("./pages/FinancialReportPage"));
const SettingsPage        = lazy(() => import("./pages/SettingsPage"));
const AuditLogPage        = lazy(() => import("./pages/AuditLogPage"));

// Barber portal — lazy loaded
const BarberDashboard      = lazy(() => import("./pages/barber/BarberDashboard"));
const MyContractsPage      = lazy(() => import("./pages/barber/MyContractsPage"));
const MyBookingsPage       = lazy(() => import("./pages/barber/MyBookingsPage"));
const MyChairBookingsPage  = lazy(() => import("./pages/barber/MyChairBookingsPage"));
const ClientsPage          = lazy(() => import("./pages/barber/ClientsPage"));
const CheckInPage          = lazy(() => import("./pages/barber/CheckInPage"));
const ClientHistoryPage    = lazy(() => import("./pages/barber/ClientHistoryPage"));
const ExplorePage          = lazy(() => import("./pages/barber/ExplorePage"));
const PaymentPage          = lazy(() => import("./pages/barber/PaymentPage"));
const EarningsPage         = lazy(() => import("./pages/barber/EarningsPage"));
const BarberProfilePage    = lazy(() => import("./pages/barber/BarberProfilePage"));

// Manager portal — lazy loaded
const ManagerDashboard     = lazy(() => import("./pages/manager/ManagerDashboard"));
const ManagerBookingsPage  = lazy(() => import("./pages/manager/ManagerBookingsPage"));
const ManagerBarbersPage   = lazy(() => import("./pages/manager/ManagerBarbersPage"));
const ManagerContractsPage = lazy(() => import("./pages/manager/ManagerContractsPage"));
const ManagerChairsPage    = lazy(() => import("./pages/manager/ManagerChairsPage"));
const ManagerPaymentsPage  = lazy(() => import("./pages/manager/ManagerPaymentsPage"));
const ManagerFinancialsPage = lazy(() => import("./pages/manager/ManagerFinancialsPage"));

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
  const { barberProfile, barber, isLocationManager, loading: barberLoading } = useBarberProfile();

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

  if (isLocationManager && !isOwner) {
    return <Navigate to="/manager/dashboard" replace />;
  }

  if (orgLoading) {
    return (
      <LoadingScreen description="Estamos carregando a organização do owner." />
    );
  }

  // Se o onboarding está ativo no localStorage, mantemos a tela de onboarding ativa
  const onboardingInProgress = localStorage.getItem("barber_onboarding_in_progress") === "true";

  if (!isOwner || onboardingInProgress) {
    return <OnboardingPage />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<OwnerDashboardPage />} />
          <Route path="locations" element={<LocationsPage />} />
          <Route path="locations/:id" element={<LocationDetailPage />} />
          <Route path="barbers" element={<BarbersPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="contracts" element={<ContractsPage />} />
          <Route path="financial" element={<FinancialReportPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="profile" element={<BarberProfilePage />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

function BarberRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { organization } = useOrganization();
  const { barberProfile, barber, isLocationManager, loading: barberLoading } = useBarberProfile();

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

  if (isLocationManager && !isOwner) {
    return <Navigate to="/manager/dashboard" replace />;
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
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="auth" element={<BarberAuthPage />} />

        <Route path="/" element={<BarberLayout />}>
          <Route index element={<Navigate to="/barber/dashboard" replace />} />
          <Route path="dashboard" element={<BarberDashboard />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="contracts" element={<MyContractsPage />} />
          <Route path="my-bookings" element={<MyBookingsPage />} />
          <Route path="chair-bookings" element={<MyChairBookingsPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route
            path="clients/:clientId/history"
            element={<ClientHistoryPage />}
          />
          <Route path="checkin" element={<CheckInPage />} />
          <Route path="earnings" element={<EarningsPage />} />
          <Route path="profile" element={<BarberProfilePage />} />
          <Route path="payment/:bookingId" element={<PaymentPage />} />
          <Route path="*" element={<Navigate to="/barber/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

function ManagerRoutes() {
  const { user, loading: authLoading } = useAuth();
  const {
    isLocationManager,
    managerPermissions,
    loading: barberLoading,
  } = useBarberProfile();

  if (authLoading || barberLoading) {
    return (
      <LoadingScreen description="Estamos carregando o acesso do gerente." />
    );
  }

  if (!user) {
    return <Navigate to="/barber/auth" replace />;
  }

  if (!isLocationManager) {
    return <Navigate to="/" replace />;
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/" element={<ManagerLayout />}>
          <Route index element={<Navigate to="/manager/dashboard" replace />} />
          <Route path="dashboard" element={<ManagerDashboard />} />
          <Route path="bookings" element={<ManagerBookingsPage />} />
          <Route path="barbers" element={<ManagerBarbersPage />} />
          <Route path="contracts" element={<ManagerContractsPage />} />
          <Route path="chairs" element={<ManagerChairsPage />} />
          <Route path="profile" element={<BarberProfilePage />} />
          <Route
            path="payments"
            element={
              managerPermissions.can_manage_payments ? (
                <ManagerPaymentsPage />
              ) : (
                <Navigate to="/manager/dashboard" replace />
              )
            }
          />
          <Route
            path="financials"
            element={
              managerPermissions.can_view_financials ? (
                <ManagerFinancialsPage />
              ) : (
                <Navigate to="/manager/dashboard" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/manager/dashboard" replace />} />
        </Route>
      </Routes>
    </Suspense>
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
                  {/* ── Public route — no auth required ── */}
                  <Route path="/access/:barberId" element={<AccessGatePage />} />
                  <Route path="/barber/*" element={<BarberRoutes />} />
                  <Route path="/manager/*" element={<ManagerRoutes />} />
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