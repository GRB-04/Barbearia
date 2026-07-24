import { useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  FileText,
  LayoutDashboard,
  LogOut,
  User,
  ClipboardCheck,
  Search,
  CalendarDays,
  CalendarRange,
  TrendingUp,
  UserCog,
  Menu,
  X,
  Scissors,
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
  const location = useLocation();
  const { isReceptionist, barberProfile } = useBarberProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Você saiu da sua conta.");
    navigate("/barber/auth", { replace: true });
  };

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const renderNavLinks = () => (
    <nav className="flex flex-col gap-1">
      <NavLink
        to="/barber/dashboard"
        onClick={closeMobileMenu}
        className={({ isActive }) => navLinkClass(isActive)}
      >
        <LayoutDashboard className="h-4 w-4" />
        Dashboard
      </NavLink>

      {!isReceptionist && (
        <NavLink
          to="/barber/explore"
          onClick={closeMobileMenu}
          className={({ isActive }) => navLinkClass(isActive)}
        >
          <Search className="h-4 w-4" />
          Explorar cadeiras
        </NavLink>
      )}

      {!isReceptionist && (
        <NavLink
          to="/barber/contracts"
          onClick={closeMobileMenu}
          className={({ isActive }) => navLinkClass(isActive)}
        >
          <FileText className="h-4 w-4" />
          Meus contratos
        </NavLink>
      )}

      {!isReceptionist && (
        <NavLink
          to="/barber/my-bookings"
          onClick={closeMobileMenu}
          className={({ isActive }) => navLinkClass(isActive)}
        >
          <CalendarDays className="h-4 w-4" />
          Minhas reservas
        </NavLink>
      )}

      {!isReceptionist && (
        <NavLink
          to="/barber/chair-bookings"
          onClick={closeMobileMenu}
          className={({ isActive }) => navLinkClass(isActive)}
        >
          <CalendarRange className="h-4 w-4" />
          Reservas de cadeira
        </NavLink>
      )}

      <NavLink
        to="/barber/clients"
        onClick={closeMobileMenu}
        className={({ isActive }) => navLinkClass(isActive)}
      >
        <User className="h-4 w-4" />
        {isReceptionist ? "Clientes da Casa" : "Meus clientes"}
      </NavLink>

      <NavLink
        to="/barber/checkin"
        onClick={closeMobileMenu}
        className={({ isActive }) => navLinkClass(isActive)}
      >
        <ClipboardCheck className="h-4 w-4" />
        Check-in
      </NavLink>

      {!isReceptionist && (
        <NavLink
          to="/barber/earnings"
          onClick={closeMobileMenu}
          className={({ isActive }) => navLinkClass(isActive)}
        >
          <TrendingUp className="h-4 w-4" />
          Meus ganhos
        </NavLink>
      )}

      <NavLink
        to="/barber/profile"
        onClick={closeMobileMenu}
        className={({ isActive }) => navLinkClass(isActive)}
      >
        <UserCog className="h-4 w-4" />
        Meu Perfil
      </NavLink>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Sticky Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Abrir Menu"
            className="h-9 w-9 shrink-0"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <div className="flex items-center gap-2 min-w-0 cursor-pointer" onClick={() => navigate("/barber/profile")}>
            <div className="h-8 w-8 rounded-full border overflow-hidden bg-muted flex items-center justify-center shrink-0">
              {(barberProfile as any)?.avatar_url ? (
                <img src={(barberProfile as any).avatar_url} alt={barberProfile?.full_name} className="h-full w-full object-cover" />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <span className="text-sm font-semibold truncate">
              {barberProfile?.full_name || "Perfil"}
            </span>
          </div>
        </div>

        <NotificationBell />
      </header>

      {/* Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="sticky top-[57px] z-30 border-b border-border bg-card p-4 shadow-lg lg:hidden">
          {renderNavLinks()}
          <div className="mt-4 pt-4 border-t border-border">
            <Button
              variant="outline"
              className="w-full justify-start rounded-2xl"
              onClick={() => { closeMobileMenu(); void handleLogout(); }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      )}

      {/* Desktop Grid Layout with Fixed Sticky Sidebar */}
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        {/* Desktop Fixed Sidebar */}
        <aside className="hidden lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-border lg:bg-card lg:p-4">
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

          <div className="flex-1 overflow-y-auto pr-1 space-y-1">
            {renderNavLinks()}
          </div>

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
        </aside>

        {/* Main scrollable content area */}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}