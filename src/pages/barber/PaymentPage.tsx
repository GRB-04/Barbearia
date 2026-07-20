import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentByBookingId, createBookingPayment, simulatePaymentConfirmation, type Payment } from "@/services/payments";
import { Loader2, QrCode, CheckCircle2, AlertCircle, ArrowLeft, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type BookingDetail = {
  id: string;
  chair_id: string;
  barber_profile_id: string | null;
  organization_id: string;
  start_at: string;
  end_at: string;
  status: string;
  notes: string | null;
  created_at: string;
  chairs: { identifier: string };
  locations: { name: string };
  barberEmail: string;
  organizationName: string;
};

export default function PaymentPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(300);
  
  // Receipt Email States
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);


  useEffect(() => {
    if (!bookingId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch booking details
        const { data: bookingData, error: bookingError } = await supabase
          .from("chair_bookings")
          .select("*")
          .eq("id", bookingId)
          .single();
          
        if (bookingError) throw bookingError;

        // Fetch chair and location details separately to avoid relationship cache issues
        const { data: chairData } = await supabase
          .from("chairs")
          .select("identifier, location_id")
          .eq("id", bookingData.chair_id)
          .single();

        let locationName = "";
        if (chairData?.location_id) {
          const { data: locData } = await supabase
            .from("locations")
            .select("name")
            .eq("id", chairData.location_id)
            .single();
          locationName = locData?.name || "";
        }
        
        // Fetch barber details
        let barberEmail = "";
        if (bookingData.barber_profile_id) {
          const { data: barberProfileData } = await supabase
            .from("barber_profiles")
            .select("email")
            .eq("id", bookingData.barber_profile_id)
            .single();
          barberEmail = barberProfileData?.email || "";
        }

        // Fetch organization details
        let orgName = "";
        if (bookingData.organization_id) {
          const { data: orgData } = await supabase
            .from("organizations")
            .select("name")
            .eq("id", bookingData.organization_id)
            .single();
          orgName = orgData?.name || "";
        }
        
        // Transform the data for the component
        const transformedBooking = {
          ...bookingData,
          chairs: {
            identifier: chairData?.identifier || "Cadeira"
          },
          locations: {
            name: locationName
          },
          barberEmail: barberEmail,
          organizationName: orgName
        };
        
        setBooking(transformedBooking);

        // Fetch or create payment
        let paymentData = await getPaymentByBookingId(bookingId);
        
        if (!paymentData) {
          // If no payment exists, create it now (useful for recovery after schema updates)
          const amount = 50.00; 
          paymentData = await createBookingPayment(bookingId, amount, bookingData.organization_id);
        }

        setPayment(paymentData);
        
        // Calculate time left based on due_date
        const due = new Date(paymentData.due_date).getTime();
        const now = new Date().getTime();
        const diff = Math.floor((due - now) / 1000);
        
        // If it just created and diff is slightly negative or zero,
        // give it at least the 5 minutes intended.
        setTimeLeft(diff > 0 ? diff : 300); 
      } catch (err: any) {
        console.error("Error loading payment data:", err);
        setError(err.message || "Não foi possível localizar ou gerar o registro de pagamento.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [bookingId]);

  // Countdown timer
  useEffect(() => {
    if (timeLeft <= 0 || payment?.status === "paid") return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, payment?.status]);

  // Polling for payment status
  useEffect(() => {
    if (!bookingId || payment?.status === "paid") return;

    const interval = setInterval(async () => {
      try {
        const updatedPayment = await getPaymentByBookingId(bookingId);
        if (updatedPayment?.status === "paid") {
          setPayment(updatedPayment);
          toast({
            title: "Pagamento Confirmado!",
            description: "Sua reserva foi confirmada com sucesso.",
          });
          clearInterval(interval);
        }
      } catch (e) {
        console.error("Polling error:", e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [bookingId, payment?.status, toast]);

  const handleCopyPixId = () => {
    if (!payment?.id) return;
    // Copia o ID do pagamento como referência para o pagador
    navigator.clipboard.writeText(payment.reference ?? payment.id);
    toast({
      title: "Referência copiada!",
      description: "Use esta referência ao confirmar o pagamento.",
    });
  };

  const handleDownloadReceipt = () => {
    if (!booking || !payment) return;

    const receiptWindow = window.open("", "_blank");
    if (!receiptWindow) {
      toast({
        title: "Erro",
        description: "Não foi possível abrir a janela do comprovante. Verifique se o bloqueador de popups está ativo.",
        variant: "destructive"
      });
      return;
    }

    const formattedPeriod = `${new Date(booking.start_at).toLocaleString("pt-BR")} até ${new Date(booking.end_at).toLocaleString("pt-BR")}`;
    const formattedPaidAt = payment.paid_at ? new Date(payment.paid_at).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");
    const orgDisplayName = booking.organizationName || "Barbearia";

    receiptWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Comprovante de Pagamento - ${orgDisplayName}</title>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            color: #1a1a1a;
            background-color: #ffffff;
            margin: 0;
            padding: 40px;
            display: flex;
            justify-content: center;
          }
          .container {
            width: 100%;
            max-width: 600px;
            border: 1px solid #e5e7eb;
            border-radius: 16px;
            padding: 40px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 24px;
            font-weight: 800;
            color: #5b21b6;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          .logo span {
            color: #1e1b4b;
          }
          .title {
            font-size: 20px;
            font-weight: 700;
            color: #1e1b4b;
            margin-top: 10px;
          }
          .divider {
            border-top: 2px dotted #e5e7eb;
            margin: 24px 0;
          }
          .details-table {
            width: 100%;
            border-collapse: collapse;
          }
          .details-table td {
            padding: 12px 0;
            font-size: 14px;
          }
          .label {
            color: #6b7280;
            width: 40%;
          }
          .value {
            font-weight: 600;
            color: #111827;
            text-align: right;
          }
          .total-box {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #e5e7eb;
          }
          .total-label {
            font-size: 16px;
            font-weight: 700;
            color: #111827;
          }
          .total-value {
            font-size: 20px;
            font-weight: 800;
            color: #5b21b6;
          }
          .footer {
            margin-top: 40px;
            text-align: center;
            font-size: 12px;
            color: #9ca3af;
          }
          @media print {
            body {
              padding: 0;
            }
            .container {
              border: none;
              box-shadow: none;
              padding: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">✂️ <span>${orgDisplayName}</span></div>
            <div class="title">Comprovante de Reserva</div>
          </div>
          
          <div class="divider"></div>
          
          <table class="details-table">
            <tr>
              <td class="label">Localização</td>
              <td class="value">${booking.locations?.name || "—"}</td>
            </tr>
            <tr>
              <td class="label">Cadeira</td>
              <td class="value">${booking.chairs?.identifier || "—"}</td>
            </tr>
            <tr>
              <td class="label">Período</td>
              <td class="value">${formattedPeriod}</td>
            </tr>
            <tr>
              <td class="label">Código de Protocolo</td>
              <td class="value">${payment.reference || payment.id}</td>
            </tr>
            <tr>
              <td class="label">E-mail do Barbeiro</td>
              <td class="value">${booking.barberEmail || "—"}</td>
            </tr>
            <tr>
              <td class="label">Data do Pagamento</td>
              <td class="value">${formattedPaidAt}</td>
            </tr>
            <tr>
              <td class="label">Método</td>
              <td class="value">Pix</td>
            </tr>
          </table>
          
          <div class="total-box">
            <span class="total-label">Valor Pago</span>
            <span class="total-value">R$ ${payment.amount?.toFixed(2)}</span>
          </div>
          
          <div class="footer">
            Este é um comprovante digital gerado automaticamente pela plataforma ${orgDisplayName}.
          </div>
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
      </html>
    `);
    receiptWindow.document.close();
  };


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !payment || !booking) {
    return (
      <div className="container mx-auto max-w-md py-12 text-center">
        <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-2xl font-bold">Reserva não encontrada</h1>
        <p className="mt-2 text-muted-foreground">{error || "Não conseguimos localizar os detalhes desta reserva."}</p>
        <Button className="mt-6" onClick={() => navigate("/barber/explore")}>
          Voltar para explorar
        </Button>
      </div>
    );
  }

  const isExpired = timeLeft <= 0 && payment.status === "pending";
  const isPaid = payment.status === "paid";

  return (
    <>
      <div className="container mx-auto max-w-2xl px-4 py-8">
      <Button 
        variant="ghost" 
        className="mb-6 flex items-center gap-2"
        onClick={() => navigate("/barber/explore")}
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar
      </Button>

      <div className="grid gap-6 md:grid-cols-1">
        <Card className="overflow-hidden border-2 shadow-lg">
          <CardHeader className="bg-muted/50 pb-6">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl">Finalizar Pagamento</CardTitle>
                <CardDescription>Reserva de cadeira - {booking.locations?.name}</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">Valor Total</p>
                <p className="text-2xl font-bold text-primary">R$ {payment.amount?.toFixed(2)}</p>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="pt-8">
            {isPaid ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="mb-4 rounded-full bg-green-100 p-4">
                  <CheckCircle2 className="h-12 w-12 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-green-700">Pagamento Confirmado!</h2>
                <p className="mt-2 text-muted-foreground">
                  Sua cadeira <strong>{booking.chairs?.identifier}</strong> está reservada.
                </p>
                <div className="mt-8 flex flex-col gap-3 w-full">
                  <div className="flex gap-3">
                    <Button className="flex-1" variant="outline" onClick={handleDownloadReceipt}>
                      Baixar Comprovante
                    </Button>
                    <Button 
                      className="flex-1" 
                      variant="outline" 
                      onClick={() => {
                        setRecipientEmail(booking.barberEmail || "");
                        setEmailDialogOpen(true);
                      }}
                    >
                      Enviar por E-mail
                    </Button>
                  </div>
                  <Button className="w-full" size="lg" onClick={() => navigate("/barber/explore")}>
                    Ver minhas reservas
                  </Button>
                </div>
              </div>
            ) : isExpired ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
                <h2 className="text-2xl font-bold text-destructive">Tempo Expirado</h2>
                <p className="mt-2 text-muted-foreground">
                  O tempo para realizar este pagamento expirou. Por favor, realize uma nova reserva.
                </p>
                <Button className="mt-8 w-full" onClick={() => navigate("/barber/explore")}>
                  Tentar Novamente
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-8 md:flex-row">
                {/* Left — Payment reference block */}
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border bg-muted/20 p-6 shadow-sm gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
                    <QrCode className="h-10 w-10 text-primary" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold">Referência do pagamento</p>
                    <p className="font-mono text-xs text-muted-foreground break-all">
                      {payment.reference ?? payment.id.slice(0, 20) + "..."}
                    </p>
                  </div>
                </div>

                {/* Right — Status */}
                <div className="flex flex-1 flex-col justify-center space-y-6">
                  <div className="rounded-xl bg-amber-50 p-4 border border-amber-100">
                    <div className="flex items-center gap-2 text-amber-800">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm font-bold">Aguardando confirmação...</span>
                    </div>
                    <p className="mt-2 text-sm text-amber-700">
                      Sua reserva expira em <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
                    </p>
                  </div>

                  <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-4">
                    <div className="flex items-start gap-2">
                      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Como funciona?</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Realize o pagamento pelo método acordado com a barbearia.
                          Após a confirmação, sua reserva será ativada automaticamente.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          
          {!isPaid && !isExpired && (
            <CardFooter className="flex flex-col border-t bg-muted/20 pt-6">
              <p className="mb-4 text-center text-xs text-muted-foreground">
                O status será atualizado automaticamente após a confirmação do pagamento.
              </p>
              <div className="flex w-full gap-4">
                <Button variant="outline" className="flex-1" onClick={() => navigate("/barber/explore")}>
                  Voltar para explorar
                </Button>
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white" 
                  onClick={async () => {
                    try {
                      await simulatePaymentConfirmation(payment.id);
                      toast({
                        title: "Pagamento Simulado",
                        description: "O status do pagamento foi alterado para pago."
                      });
                      // Refresh the page to show confirmed state
                      window.location.reload();
                    } catch (e: any) {
                      toast({
                        title: "Erro",
                        description: "Não foi possível simular o pagamento.",
                        variant: "destructive"
                      });
                    }
                  }}
                >
                  Simular Pagamento
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar Comprovante por E-mail</DialogTitle>
            <DialogDescription>
              Digite o e-mail de destino para o envio do comprovante.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>E-mail do destinatário</Label>
              <Input
                type="email"
                placeholder="exemplo@email.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
              />
            </div>
            <Button
              className="w-full"
              disabled={sendingEmail || !recipientEmail}
              onClick={async () => {
                setSendingEmail(true);
                // Simulate sending email
                await new Promise((resolve) => setTimeout(resolve, 1500));
                setSendingEmail(false);
                setEmailDialogOpen(false);
                toast({
                  title: "E-mail Enviado!",
                  description: `O comprovante foi enviado com sucesso para ${recipientEmail}.`,
                });
              }}
            >
              {sendingEmail ? "Enviando..." : "Enviar Comprovante"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
