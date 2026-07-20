import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  Scissors,
  User,
  ClipboardCheck,
  Search,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  UserCog,
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

export default function BarberLayout() {
  const navigate = useNavigate();
  const { isReceptionist, isAdmin, barberProfile } = useBarberProfile();

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
            {barberProfile && (
              <div 
                onClick={() => navigate("/barber/profile")}
                className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-muted-foreground/10 bg-muted/20 p-3 cursor-pointer hover:bg-muted/30 transition-all select-none"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full border border-muted-foreground/10 overflow-hidden bg-background flex items-center justify-center shrink-0">
                    {(barberProfile as any).avatar_url ? (
                      <img src={(barberProfile as any).avatar_url} alt={barberProfile.full_name} className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{barberProfile.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {isReceptionist ? "Recepcionista" : barberProfile.role === "manager" ? "Gerente" : "Barbeiro"}
                    </p>
                  </div>
                </div>
                
                <div onClick={(e) => e.stopPropagation()}>
                  <NotificationBell />
                </div>
              </div>
            )}

            <nav className="flex flex-col gap-1">
              <NavLink
                to="/barber/dashboard"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </NavLink>

              {!isReceptionist && (
                <NavLink
                  to="/barber/explore"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <Search className="h-4 w-4" />
                  Explorar cadeiras
                </NavLink>
              )}

              {!isReceptionist && (
                <NavLink
                  to="/barber/contracts"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <FileText className="h-4 w-4" />
                  Meus contratos
                </NavLink>
              )}

              {!isReceptionist && (
                <NavLink
                  to="/barber/my-bookings"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <CalendarDays className="h-4 w-4" />
                  Minhas reservas
                </NavLink>
              )}

              {!isReceptionist && (
                <NavLink
                  to="/barber/chair-bookings"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <CalendarRange className="h-4 w-4" />
                  Reservas de cadeira
                </NavLink>
              )}

              <NavLink
                to="/barber/clients"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <User className="h-4 w-4" />
                {isReceptionist ? "Clientes da Casa" : "Meus clientes"}
              </NavLink>

              <NavLink
                to="/barber/checkin"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <ClipboardCheck className="h-4 w-4" />
                Check-in
              </NavLink>

              {!isReceptionist && (
                <NavLink
                  to="/barber/earnings"
                  className={({ isActive }) => navLinkClass(isActive)}
                >
                  <TrendingUp className="h-4 w-4" />
                  Meus ganhos
                </NavLink>
              )}

              <NavLink
                to="/barber/profile"
                className={({ isActive }) => navLinkClass(isActive)}
              >
                <UserCog className="h-4 w-4" />
                Meu Perfil
              </NavLink>
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