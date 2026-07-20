import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hourglass } from "lucide-react";
import {
  listLocationWaitlist,
  type LocationWaitlistEntry,
} from "@/services/waitlist";

const statusLabel: Record<string, string> = {
  waiting: "Aguardando",
  hold: "Vaga oferecida",
};

function formatPeriod(startAt: string, endAt: string) {
  const s = new Date(startAt);
  const e = new Date(endAt);
  return `${s.toLocaleDateString("pt-BR")} • ${s.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}–${e.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function LocationWaitlistSection({ locationId }: { locationId: string }) {
  const [entries, setEntries] = useState<LocationWaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    listLocationWaitlist(locationId)
      .then((data) => {
        if (active) setEntries(data);
      })
      .catch((e) => console.error("Erro ao carregar fila do ponto:", e))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locationId]);

  if (loading || entries.length === 0) return null;

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hourglass className="h-4 w-4" />
          Fila de espera ({entries.length})
        </CardTitle>
        <CardDescription>
          Barbeiros aguardando vaga em cadeiras deste ponto — demanda além da capacidade atual.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between rounded-lg border p-3 text-sm"
          >
            <div>
              <span className="font-medium">{entry.barber_name}</span>{" "}
              <span className="text-muted-foreground">— {entry.chair_identifier}</span>
              <p className="text-xs text-muted-foreground">
                {formatPeriod(entry.desired_start_at, entry.desired_end_at)}
              </p>
            </div>
            <Badge variant={entry.status === "hold" ? "default" : "secondary"}>
              {statusLabel[entry.status] ?? entry.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
