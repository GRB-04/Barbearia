import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  LayoutDashboard,
  MapPin,
  User,
  FileText,
  LogOut,
  DollarSign,
  Settings,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import NotificationBell from "@/components/NotificationBell";

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/locations", label: "Locais", icon: MapPin },
  { to: "/barbers", label: "Barbeiros", icon: User },
  { to: "/bookings", label: "Reservas", icon: CalendarDays },
  { to: "/contracts", label: "Contratos", icon: FileText },
  { to: "/financial", label: "Financeiro", icon: DollarSign },
  { to: "/audit", label: "Auditoria", icon: ShieldCheck },
  { to: "/settings", label: "Configurações", icon: Settings },
];

export default function AppLayout() {
  const { signOut } = useAuth();

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-border bg-sidebar">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <LayoutDashboard className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">Barber Chair</span>
          </div>
          <NotificationBell />
        </div>


        <nav className="flex-1 space-y-0.5 px-2 py-2">
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

        <div className="border-t border-border px-2 py-2">
          <button
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-foreground"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
