import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useBarberProfile } from "@/hooks/useBarberProfile";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarDays, Armchair, FileText } from "lucide-react";
import {
  fetchLocationInfo,
  fetchLocationBookings,
  fetchLocationChairs,
  fetchLocationContracts,
} from "@/services/managerData";

type DashboardData = {
  locationName: string;
  pendingCount: number;
  chairCount: number;
  activeContractCount: number;
};

export default function ManagerDashboard() {
  const { managerLocationId } = useBarberProfile();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!managerLocationId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const [locationInfo, pendingBookings, chairs, contracts] = await Promise.all([
          fetchLocationInfo(managerLocationId),
          fetchLocationBookings(managerLocationId, true),
          fetchLocationChairs(managerLocationId),
          fetchLocationContracts(managerLocationId),
        ]);

        setData({
          locationName: locationInfo?.name ?? "Ponto físico",
          pendingCount: pendingBookings.length,
          chairCount: chairs.length,
          activeContractCount: contracts.filter((c: any) => c.status === "active").length,
        });
      } catch {
        // silently ignore; cards will remain null
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [managerLocationId]);

  if (!managerLocationId) {
    return (
      <div className="p-6">
        <div className="rounded-3xl border border-border bg-card p-6 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground">
            Sua conta de gerente não está vinculada a um ponto físico. Fale com o dono da organização.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {loading ? "Carregando..." : (data?.locationName ?? "Ponto físico")}
        </p>
      </div>

      {loading ? (
        <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
          <p className="text-sm text-muted-foreground">Carregando dados...</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <CalendarDays className="h-5 w-5 text-amber-500" />
                <p className="text-sm font-medium text-muted-foreground">Reservas pendentes</p>
              </div>
              <p className="text-3xl font-bold text-foreground">{data?.pendingCount ?? 0}</p>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <Armchair className="h-5 w-5 text-muted-foreground" />
                <p className="text-sm font-medium text-muted-foreground">Total de cadeiras</p>
              </div>
              <p className="text-3xl font-bold text-foreground">{data?.chairCount ?? 0}</p>
            </div>

            <div className="rounded-3xl border border-border bg-card p-6">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="h-5 w-5 text-emerald-500" />
                <p className="text-sm font-medium text-muted-foreground">Contratos ativos</p>
              </div>
              <p className="text-3xl font-bold text-foreground">{data?.activeContractCount ?? 0}</p>
            </div>
          </div>

          {(data?.pendingCount ?? 0) > 0 && (
            <div className="rounded-3xl border border-border bg-card p-6">
              <p className="text-sm font-medium text-foreground mb-3">
                Há {data!.pendingCount} reserva{data!.pendingCount > 1 ? "s" : ""} aguardando aprovação.
              </p>
              <Button asChild size="sm" className="rounded-xl">
                <Link to="/manager/bookings">Ver reservas pendentes</Link>
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
