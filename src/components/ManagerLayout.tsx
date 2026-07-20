// src/components/ManagerLayout.tsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Armchair,
  CalendarDays,
  FileText,
  LayoutDashboard,
  LogOut,
  Scissors,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import NotificationBell from "@/components/NotificationBell";

function navLinkClass(isActive: boolean) {
  return [
    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
    isActive
      ? "bg-accent text-foreground"
      : "text-muted-foreground hover:bg-accent hover:text-foreground",
  ].join(" ");
}

export default function ManagerLayout() {
  const navigate = useNavigate();
  const { managerPermissions } = useBarberProfile();

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Você saiu da sua conta.");
    navigate("/barber/auth", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <aside className="border-b border-border bg-card lg:border-b-0 lg:border-r">
          <div className="flex h-full flex-col p-4">
            <div className="mb-6 flex items-center justify-between gap-3 px-2">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
                  <Scissors className="h-5 w-5 text-foreground" />
                </div>

                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Portal do gerente
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Gestão do ponto físico
                  </p>
                </div>
              </div>
              <NotificationBell />
            </div>

            <nav className="flex flex-col gap-1">
              <NavLink
                to="/manager/dashboard"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </NavLink>

              <NavLink
                to="/manager/bookings"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <CalendarDays className="h-4 w-4" />
                Reservas
              </NavLink>

              <NavLink
                to="/manager/barbers"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <Users className="h-4 w-4" />
                Barbeiros
              </NavLink>

              <NavLink
                to="/manager/contracts"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <FileText className="h-4 w-4" />
                Contratos
              </NavLink>

              <NavLink
                to="/manager/chairs"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <Armchair className="h-4 w-4" />
                Cadeiras
              </NavLink>

              {managerPermissions.can_manage_payments && (
                <NavLink
                  to="/manager/payments"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <Wallet className="h-4 w-4" />
                  Cobranças
                </NavLink>
              )}

              {managerPermissions.can_view_financials && (
                <NavLink
                  to="/manager/financials"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <TrendingUp className="h-4 w-4" />
                  Financeiro
                </NavLink>
              )}
            </nav>

            <div className="mt-auto pt-6">
              <Button
                variant="outline"
                className="w-full justify-start rounded-2xl"
                onClick={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
