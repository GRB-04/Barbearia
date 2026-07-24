import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  MapPin,
  Users,
  FileText,
  LogOut,
  DollarSign,
  Settings,
  ShieldCheck,
  CalendarDays,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { to: "/locations", label: "Locais", icon: MapPin },
  { to: "/barbers", label: "Equipe", icon: Users },
  { to: "/bookings", label: "Reservas", icon: CalendarDays },
  { to: "/contracts", label: "Contratos", icon: FileText },
  { to: "/financial", label: "Financeiro", icon: DollarSign },
  { to: "/audit", label: "Auditoria", icon: ShieldCheck },
  { to: "/settings", label: "Configurações", icon: Settings },
];

export default function AppLayout() {
  const { signOut } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-background flex flex-col lg:flex-row">
      {/* Mobile Sticky Top Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-sidebar px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Abrir Menu"
            className="h-9 w-9 text-foreground"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <LayoutDashboard className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div>
              <span className="block text-sm font-semibold tracking-tight text-foreground">BarberHouse</span>
              <span className="block text-xs text-muted-foreground">Portal da organização</span>
            </div>
          </div>
        </div>

        <NotificationBell />
      </header>

      {/* Mobile Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="sticky top-[57px] z-30 border-b border-border bg-sidebar p-4 shadow-lg lg:hidden">
          <nav className="space-y-0.5">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={closeMobileMenu}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150",
                    isActive
                      ? "bg-sidebar-accent text-foreground font-semibold"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-4 pt-4 border-t border-border">
            <button
              onClick={() => { closeMobileMenu(); void signOut(); }}
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      )}

      {/* Desktop Fixed Sticky Sidebar */}
      <aside className="hidden lg:sticky lg:top-0 lg:z-30 lg:flex lg:w-60 lg:h-screen lg:flex-col lg:border-r lg:border-border lg:bg-sidebar shrink-0">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <LayoutDashboard className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <div>
              <span className="block text-sm font-semibold tracking-tight text-foreground">BarberHouse</span>
              <span className="block text-xs text-muted-foreground">Portal da organização</span>
            </div>
          </div>
          <NotificationBell />
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-sidebar-accent text-foreground relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-0.5 before:rounded-full before:bg-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border px-2 py-2 mt-auto">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main scrollable content */}
      <main className="flex-1 min-w-0 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
