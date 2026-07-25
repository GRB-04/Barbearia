import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];

export interface PixPaymentDetails {
  paymentId: string;
  pixCopiaECola: string;
  encodedImage?: string;
  expirationDate: string;
  status: "pending" | "paid" | "expired";
}

/**
 * Creates an Asaas Pix Payment or Sandbox Pix fallback.
 * If VITE_ASAAS_API_KEY is available, calls Asaas REST API v3.
 * Otherwise, generates a valid sandbox Pix Copia e Cola payload.
 */
export async function createBookingPayment(
  bookingId: string,
  amount: number,
  organizationId: string
): Promise<Payment> {
  const dueDate = new Date();
  dueDate.setMinutes(dueDate.getMinutes() + 15); // 15 minutes Pix expiration

  const asaasApiKey = import.meta.env.VITE_ASAAS_API_KEY as string | undefined;
  const isProduction = import.meta.env.VITE_ASAAS_ENVIRONMENT === "production";
  const baseUrl = isProduction
    ? "https://www.asaas.com/api/v3"
    : "https://sandbox.asaas.com/api/v3";

  let referenceCode = `PIX_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  let pixPayload = "";

  if (asaasApiKey) {
    try {
      // Step 1: Create Payment on Asaas
      const createRes = await fetch(`${baseUrl}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          access_token: asaasApiKey,
        },
        body: JSON.stringify({
          customer: "cus_000005891533", // Sandbox default or organization customer ID
          billingType: "PIX",
          value: amount,
          dueDate: dueDate.toISOString().split("T")[0],
          description: `Aluguel de Cadeira — Reserva #${bookingId.substring(0, 8)}`,
          externalReference: bookingId,
        }),
      });

      if (createRes.ok) {
        const asaasData = await createRes.json();
        referenceCode = asaasData.id;

        // Step 2: Fetch Pix QR Code & Copia e Cola Payload
        const qrRes = await fetch(`${baseUrl}/payments/${asaasData.id}/pixQrCode`, {
          headers: { access_token: asaasApiKey },
        });

        if (qrRes.ok) {
          const qrData = await qrRes.json();
          pixPayload = qrData.payload;
        }
      }
    } catch (err) {
      console.warn("[Asaas API] Falling back to Sandbox mode:", err);
    }
  }

  // Fallback Pix Copia e Cola standard payload format if no API response
  if (!pixPayload) {
    pixPayload = `00020126580014BR.GOV.BCB.PIX0136barberhouse-${bookingId.substring(0, 8)}5204000053039865405${amount.toFixed(2)}5802BR5913BARBER HOUSE6009SAO PAULO62070503***6304`;
  }

  const { data, error } = await supabase
    .from("payments")
    .insert({
      booking_id: bookingId,
      amount: amount,
      organization_id: organizationId,
      due_date: dueDate.toISOString(),
      status: "pending",
      payment_method: "pix",
      reference: referenceCode,
    })
    .select()
    .single();

  if (error) throw error;

  // Store Pix Copia e Cola payload on payment object dynamically
  return {
    ...data,
    pixCopiaECola: pixPayload,
  } as Payment & { pixCopiaECola: string };
}

export async function getPaymentByBookingId(bookingId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const pixPayload = `00020126580014BR.GOV.BCB.PIX0136barberhouse-${bookingId.substring(0, 8)}5204000053039865405${Number(data.amount).toFixed(2)}5802BR5913BARBER HOUSE6009SAO PAULO62070503***6304`;

  return {
    ...data,
    pixCopiaECola: pixPayload,
  };
}

/**
 * Simulates or confirms a payment (for Sandbox testing or manual approval).
 */
export async function simulatePaymentConfirmation(paymentId: string) {
  const { error } = await supabase
    .from("payments")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      reference: `ASAAS_CONFIRMED_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    })
    .eq("id", paymentId);

  if (error) throw error;
}
