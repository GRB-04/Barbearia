import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const CONSENT_KEY = "barber_lgpd_consent_v1";

export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function checkConsent() {
      // 1. Verifica localStorage primeiro (resposta rápida)
      const local = localStorage.getItem(CONSENT_KEY);
      if (local && local !== "dismissed") {
        setVisible(false);
        return;
      }

      // 2. Verifica no banco se o usuário logado já consentiu
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const userId = sessionData?.session?.user?.id;

        if (userId) {
          const { data } = await supabase
            .from("consent_records")
            .select("id")
            .eq("user_id", userId)
            .eq("consent_type", "lgpd_v1")
            .maybeSingle();

          if (data) {
            // Já consentiu — salva no localStorage para não bater no banco novamente
            localStorage.setItem(CONSENT_KEY, new Date().toISOString());
            setVisible(false);
            return;
          }
        }
      } catch {
        // Se falhar a consulta, apenas mostra o banner
      }

      // 3. Não encontrou consentimento — exibe banner
      if (!local) {
        setVisible(true);
      }
    }

    void checkConsent();
  }, []);

  async function accept() {
    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id ?? null;

      // Salva no Supabase
      await supabase.from("consent_records").insert({
        user_id: userId,
        consent_type: "lgpd_v1",
        user_agent: navigator.userAgent,
        session_id: sessionData?.session?.access_token?.slice(-16) ?? null,
      } as any);

      // Salva no localStorage como cache
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
    } catch (err) {
      console.error("[LGPD] Erro ao salvar consentimento:", err);
      // Mesmo com erro no banco, salva localmente para não bloquear o usuário
      localStorage.setItem(CONSENT_KEY, new Date().toISOString());
    } finally {
      setSaving(false);
      setVisible(false);
    }
  }

  function dismiss() {
    localStorage.setItem(CONSENT_KEY, "dismissed");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm p-4 shadow-2xl">
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Privacidade e proteção de dados (LGPD)
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Armazenamos seus dados de uso para garantir o funcionamento do sistema,
              em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018).
              Seus dados não são compartilhados com terceiros. Ao aceitar, registramos
              seu consentimento com data e hora para fins legais.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" className="rounded-xl" onClick={accept} disabled={saving}>
            {saving ? "Registrando..." : "Aceitar e continuar"}
          </Button>
          <button
            onClick={dismiss}
            className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
