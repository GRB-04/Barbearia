import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Payment = Database["public"]["Tables"]["payments"]["Row"];

export async function createBookingPayment(bookingId: string, amount: number, organizationId: string) {
  const dueDate = new Date();
  dueDate.setMinutes(dueDate.getMinutes() + 5); // 5 minutes timeout

  const { data, error } = await supabase
    .from("payments")
    .insert({
      booking_id: bookingId,
      amount: amount,
      organization_id: organizationId,
      due_date: dueDate.toISOString(),
      status: "pending",
      payment_method: "pix",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getPaymentByBookingId(bookingId: string) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Simulates a payment confirmation for testing purposes.
 * In a real scenario, this would be handled by a webhook from the payment gateway.
 */
export async function simulatePaymentConfirmation(paymentId: string) {
  const { error } = await supabase
    .from("payments")
    .update({ 
      status: "paid",
      paid_at: new Date().toISOString(),
      reference: `MOCK_PIX_${Math.random().toString(36).substring(7).toUpperCase()}`
    })
    .eq("id", paymentId);

  if (error) throw error;
}
