import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrgProvider, useOrganization } from "@/hooks/useOrganization";
import { BarberProfileProvider, useBarberProfile } from "@/hooks/useBarberProfile";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import AppLayout from "./components/AppLayout";
import BarberLayout from "./components/BarberLayout";
import LocationsPage from "./pages/LocationsPage";
import LocationDetailPage from "./pages/LocationDetailPage";
import BarbersPage from "./pages/BarbersPage";
import ContractsPage from "./pages/ContractsPage";
import BarberAuthPage from "./pages/barber/BarberAuthPage";
import BarberDashboard from "./pages/barber/BarberDashboard";
import BrowseStationsPage from "./pages/barber/BrowseStationsPage";
import MyBookingsPage from "./pages/barber/MyBookingsPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function OwnerRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { organization, loading: orgLoading } = useOrganization();

  if (authLoading || (user && orgLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return <AuthPage />;
  if (!organization) return <OnboardingPage />;

  return (
    <Routes>
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Navigate to="/locations" replace />} />
        <Route path="locations" element={<LocationsPage />} />
        <Route path="locations/:id" element={<LocationDetailPage />} />
        <Route path="barbers" element={<BarbersPage />} />
        <Route path="contracts" element={<ContractsPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

function BarberRoutes() {
  const { user, loading: authLoading } = useAuth();
  const { barberProfile, loading: profileLoading } = useBarberProfile();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="auth" element={!user || !barberProfile ? <BarberAuthPage /> : <Navigate to="/barber/dashboard" replace />} />
      {!user || (!profileLoading && !barberProfile) ? (
        <Route path="*" element={<Navigate to="/barber/auth" replace />} />
      ) : profileLoading ? (
        <Route path="*" element={
          <div className="flex min-h-screen items-center justify-center bg-background">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </div>
        } />
      ) : (
        <Route path="" element={<BarberLayout />}>
          <Route path="dashboard" element={<BarberDashboard />} />
          <Route path="browse" element={<BrowseStationsPage />} />
          <Route path="bookings" element={<MyBookingsPage />} />
          <Route index element={<Navigate to="/barber/dashboard" replace />} />
        </Route>
      )}
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
            <BarberProfileProvider>
              <Routes>
                <Route path="/barber/*" element={<BarberRoutes />} />
                <Route path="/*" element={<OwnerRoutes />} />
              </Routes>
            </BarberProfileProvider>
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
