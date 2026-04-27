import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getPaymentByBookingId, simulatePaymentConfirmation, createBookingPayment, type Payment } from "@/services/payments";
import { Loader2, QrCode, Copy, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

export default function PaymentPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [booking, setBooking] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes in seconds
  const [isConfirming, setIsConfirming] = useState(false);

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
        
        // Transform the data for the component
        const transformedBooking = {
          ...bookingData,
          chairs: {
            identifier: chairData?.identifier || "Cadeira"
          },
          locations: {
            name: locationName
          }
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
        
        console.log("Time Sync Check:", { 
          due: new Date(paymentData.due_date).toISOString(), 
          now: new Date(now).toISOString(), 
          diff 
        });

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

  const handleCopyPix = () => {
    const pixKey = "00020126330014BR.GOV.BCB.PIX0111123456789015204000053039865802BR5913BARBER_CHAIR6009SAO_PAULO62070503***6304ABCD";
    navigator.clipboard.writeText(pixKey);
    toast({
      title: "Copiado!",
      description: "Código Pix Copia e Cola copiado para a área de transferência.",
    });
  };

  const handleSimulatePayment = async () => {
    if (!payment) return;
    
    try {
      setIsConfirming(true);
      await simulatePaymentConfirmation(payment.id);
      // The polling will pick up the change
    } catch (error: any) {
      toast({
        title: "Erro na simulação",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsConfirming(false);
    }
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
                <div className="mt-6 w-full rounded-xl border bg-muted/30 p-4 text-sm">
                  <p><strong>Protocolo:</strong> {payment.reference}</p>
                  <p><strong>Data:</strong> {new Date(payment.paid_at!).toLocaleString("pt-BR")}</p>
                </div>
                <Button className="mt-8 w-full" size="lg" onClick={() => navigate("/barber/explore")}>
                  Ver minhas reservas
                </Button>
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
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border bg-white p-6 shadow-sm">
                  <div className="relative mb-4 aspect-square w-48 bg-muted/20 flex items-center justify-center rounded-xl">
                    <QrCode className="h-40 w-40 text-slate-800" />
                    <div className="absolute inset-0 flex items-center justify-center bg-white/60 opacity-0 transition-opacity hover:opacity-100">
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-900">Exemplo Pix</p>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-muted-foreground">Escaneie o QR Code no seu app de banco</p>
                </div>

                <div className="flex flex-1 flex-col justify-center space-y-6">
                  <div className="space-y-2">
                    <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Pix Copia e Cola</p>
                    <div className="flex gap-2">
                      <div className="flex-1 truncate rounded-lg border bg-muted/30 px-3 py-2 text-sm font-mono">
                        00020126330014BR.GOV.BCB.PIX0111123456789015204000053039865802BR5913BARBER_CHAIR6009SAO_PAULO62070503***6304ABCD
                      </div>
                      <Button size="icon" variant="outline" onClick={handleCopyPix}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 p-4 border border-amber-100">
                    <div className="flex items-center gap-2 text-amber-800">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm font-bold">Aguardando pagamento...</span>
                    </div>
                    <p className="mt-2 text-sm text-amber-700">
                      Sua reserva expira em <span className="font-mono font-bold">{formatTime(timeLeft)}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
          
          {!isPaid && !isExpired && (
            <CardFooter className="flex flex-col border-t bg-muted/20 pt-6">
              <p className="mb-4 text-center text-xs text-muted-foreground">
                Ao realizar o pagamento, sua reserva será confirmada instantaneamente.
              </p>
              <div className="flex w-full gap-3">
                <Button variant="outline" className="flex-1" onClick={() => navigate("/barber/explore")}>
                  Pagar depois
                </Button>
                <Button 
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleSimulatePayment}
                  disabled={isConfirming}
                >
                  {isConfirming ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Simular Pagamento
                </Button>
              </div>
            </CardFooter>
          )}
        </Card>
      </div>
    </div>
  );
}
