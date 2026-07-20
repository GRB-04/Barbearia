// Re-export from chairBookings — this file is kept only for backward compatibility.
// All booking logic lives in chairBookings.ts.
export {
  cancelMyBarberBooking,
  listMyBarberBookings,
  type BarberBookingItem,
} from "@/services/chairBookings";
