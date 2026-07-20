import { describe, it, expect } from "vitest";
import {
  getFriendlyBookingError,
  getDayConfig,
  getSuggestedBookingSlot,
  formatDayHours,
} from "./ChairBookingForm";

describe("ChairBookingForm Utilities", () => {
  describe("getFriendlyBookingError", () => {
    it("maps database overlap constraint errors to friendly messages", () => {
      expect(getFriendlyBookingError("chair_bookings_no_overlap_per_chair")).toBe(
        "Essa cadeira já está reservada nesse horário."
      );
      expect(getFriendlyBookingError("chair_bookings_no_overlap_per_barber")).toBe(
        "Você já possui outra reserva ativa nesse mesmo horário."
      );
    });

    it("maps duration constraints", () => {
      expect(getFriendlyBookingError("minimum_4_hours")).toBe(
        "A reserva precisa ter no mínimo 4 horas."
      );
      expect(getFriendlyBookingError("minimum_duration")).toBe(
        "A reserva precisa ter no mínimo 4 horas."
      );
    });

    it("maps operating hours constraints", () => {
      expect(getFriendlyBookingError("operating_hours violation")).toBe(
        "O horário selecionado está fora do funcionamento deste local."
      );
    });

    it("returns default message for unknown errors", () => {
      expect(getFriendlyBookingError("Some random DB error")).toBe("Some random DB error");
    });
  });

  describe("getDayConfig", () => {
    it("returns null when no hours are configured", () => {
      expect(getDayConfig(null, new Date())).toBeNull();
    });

    it("handles named days format (e.g., 'monday')", () => {
      const hours = {
        monday: { open: true, start: "09:00", end: "18:00" },
        sunday: { open: false },
      };
      // Monday
      const monday = new Date("2026-07-06T12:00:00"); 
      expect(getDayConfig(hours, monday)).toEqual({
        open: true,
        start: "09:00",
        end: "18:00",
      });

      // Sunday
      const sunday = new Date("2026-07-05T12:00:00");
      expect(getDayConfig(hours, sunday)).toEqual({
        open: false,
        start: undefined,
        end: undefined,
      });
    });

    it("handles numeric days format (0=Sun, 1=Mon, etc.)", () => {
      const hours = {
        "1": { enabled: true, open: "08:00", close: "17:00" },
        "0": { enabled: false },
      };
      // Monday
      const monday = new Date("2026-07-06T12:00:00");
      expect(getDayConfig(hours, monday)).toEqual({
        open: true,
        start: "08:00",
        end: "17:00",
      });

      // Sunday
      const sunday = new Date("2026-07-05T12:00:00");
      expect(getDayConfig(hours, sunday)).toEqual({
        open: false,
        start: undefined,
        end: undefined,
      });
    });
  });

  describe("getSuggestedBookingSlot", () => {
    const hours = {
      monday: { open: true, start: "09:00", end: "19:00" },
      tuesday: { open: true, start: "09:00", end: "19:00" },
      wednesday: { open: false },
      thursday: { open: true, start: "09:00", end: "19:00" },
      friday: { open: true, start: "09:00", end: "19:00" },
      saturday: { open: true, start: "10:00", end: "15:00" },
      sunday: { open: false },
    };

    it("suggests slot rounded to next hour on open day if there's enough time", () => {
      // Monday at 10:15 => should round to Monday 11:00 to 15:00 (4h minimum)
      const now = new Date("2026-07-06T10:15:00");
      const slot = getSuggestedBookingSlot(now, hours);
      expect(slot).toEqual({
        date: "2026-07-06",
        start: "11:00",
        end: "15:00",
      });
    });

    it("moves slot to next day if not enough time remaining on current day", () => {
      // Monday at 16:30 => rounds to 17:00. But 17:00 + 4h = 21:00, which exceeds 19:00 close.
      // So should move to Tuesday 09:00 to 13:00.
      const now = new Date("2026-07-06T16:30:00");
      const slot = getSuggestedBookingSlot(now, hours);
      expect(slot).toEqual({
        date: "2026-07-07",
        start: "09:00",
        end: "13:00",
      });
    });

    it("skips closed days when looking for next slot", () => {
      // Tuesday at 18:00 => rounds to 19:00 (too late). Next day (Wednesday) is closed.
      // So should suggest Thursday 09:00 to 13:00.
      const now = new Date("2026-07-07T18:00:00");
      const slot = getSuggestedBookingSlot(now, hours);
      expect(slot).toEqual({
        date: "2026-07-09",
        start: "09:00",
        end: "13:00",
      });
    });

    it("adjusts to open time if current time is before open time", () => {
      // Monday at 06:00 => rounds to 06:00. But open time is 09:00.
      // So should suggest Monday 09:00 to 13:00.
      const now = new Date("2026-07-06T06:00:00");
      const slot = getSuggestedBookingSlot(now, hours);
      expect(slot).toEqual({
        date: "2026-07-06",
        start: "09:00",
        end: "13:00",
      });
    });
  });

  describe("formatDayHours", () => {
    it("formats operating hours correctly", () => {
      const hours = {
        monday: { open: true, start: "09:00", end: "19:00" },
        sunday: { open: false },
      };
      const monday = new Date("2026-07-06T12:00:00");
      const sunday = new Date("2026-07-05T12:00:00");

      expect(formatDayHours(hours, monday)).toBe("09:00 – 19:00");
      expect(formatDayHours(hours, sunday)).toBe("Fechado");
      expect(formatDayHours(null, monday)).toBe("Sem horário definido");
    });
  });
});
