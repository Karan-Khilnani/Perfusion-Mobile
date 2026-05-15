import { db } from "../db";
import { bookings, consultants } from "../../shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { triggerVoiceCall } from "./msg91";

const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || "";

// Tracks booking IDs that have already had appointment reminders fired
// this server session, so we never double-call anyone.
const remindedBookingIds = new Set<string>();

const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/**
 * Parse an appointmentSlot string in any of these formats:
 *   "Mon, 15 May 2026, 10:00 AM – 11:00 AM"   (full date — calendar booking)
 *   "Mon 10:00 AM"                              (legacy — day+time only)
 *   "Monday 10:00 AM"
 *   "Emergency - Immediate"                     → null (no time)
 *
 * For day+time-only slots the date is resolved to the current week's
 * occurrence of that weekday, so "Mon 10:00 AM" on a Monday at 10:00 AM
 * will match right now.
 */
function parseSlotStart(slot: string): Date | null {
  if (!slot || slot.toLowerCase().includes("emergency") || slot.toLowerCase().includes("immediate")) {
    return null;
  }

  const now = new Date();

  // ── Format 1: full date string ──────────────────────────────────────────
  // "Mon, 15 May 2026, 10:00 AM – 11:00 AM"  or  "15 May 2026 10:00 AM"
  // Strip the leading "Day, " prefix and anything after "–"
  const beforeDash = slot.split(/[–—-]/)[0].trim();
  const withoutDow = beforeDash.replace(/^[A-Za-z]+,\s*/, "").trim(); // remove "Mon, "
  const normalized = withoutDow.replace(/,\s*/, " ").trim();          // "15 May 2026 10:00 AM"
  if (/\d{4}/.test(normalized)) {
    // Contains a year — try direct parse
    const parsed = new Date(normalized);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  // ── Format 2: "Mon 10:00 AM" or "Monday 09:30 AM" ───────────────────────
  const shortMatch = slot.match(
    /^(sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(\d{1,2}):(\d{2})\s*(am|pm)/i
  );
  if (shortMatch) {
    const dayKey = shortMatch[1].toLowerCase();
    const targetDow = DAY_MAP[dayKey];
    if (targetDow === undefined) return null;

    let hours = parseInt(shortMatch[2], 10);
    const minutes = parseInt(shortMatch[3], 10);
    const ampm = shortMatch[4].toLowerCase();
    if (ampm === "pm" && hours !== 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;

    // Find this week's occurrence of targetDow (relative to today)
    const currentDow = now.getDay(); // 0=Sun … 6=Sat
    const diff = targetDow - currentDow; // can be negative → earlier this week
    const target = new Date(now);
    target.setDate(now.getDate() + diff);
    target.setHours(hours, minutes, 0, 0);
    return target;
  }

  return null;
}

/** Returns true when two Dates are in the same calendar minute. */
function sameMinute(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate() &&
    a.getHours() === b.getHours() &&
    a.getMinutes() === b.getMinutes()
  );
}

/**
 * Fire Twilio voice calls to the consultant, seeker, and admin
 * when a consultation booking's slot time arrives.
 */
async function fireAppointmentReminders(): Promise<void> {
  try {
    const activeBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingType, "consultation"),
          inArray(bookings.status, ["booked", "confirmed"])
        )
      );

    const now = new Date();
    console.log(`[Scheduler] Tick — ${now.toLocaleTimeString()} | ${activeBookings.length} active consultation booking(s) checked`);

    for (const booking of activeBookings) {
      if (remindedBookingIds.has(booking.id)) continue;
      if (!booking.appointmentSlot) continue;

      const slotStart = parseSlotStart(booking.appointmentSlot);

      if (!slotStart) {
        console.log(`[Scheduler]   Booking ${booking.bookingNumber || booking.id}: slot "${booking.appointmentSlot}" — cannot parse, skipping`);
        continue;
      }

      const matches = sameMinute(slotStart, now);
      console.log(`[Scheduler]   Booking ${booking.bookingNumber || booking.id}: slot "${booking.appointmentSlot}" → parsed ${slotStart.toLocaleTimeString()} | match=${matches}`);

      if (!matches) continue;

      remindedBookingIds.add(booking.id);
      const patientName = booking.patientName || "Patient";
      const bookingRef = booking.bookingNumber || booking.id;

      console.log(`[Scheduler] ★ FIRING reminders for booking ${bookingRef} (${patientName})`);

      const consultantMsg =
        `Hello. This is a reminder from Perfusion Healthcare. ` +
        `Your consultation with ${patientName} is scheduled to start now. ` +
        `Please log in to the Perfusion portal to join the call.`;

      const seekerMsg =
        `Hello. This is a reminder from Perfusion Healthcare. ` +
        `Your consultation is scheduled to start now. ` +
        `Please log in to the Perfusion portal to join the call.`;

      const adminMsg =
        `Hello. This is a Perfusion Healthcare reminder. ` +
        `Consultation booking ${bookingRef} for ${patientName} is starting now.`;

      // Call consultant
      if (booking.providerId) {
        const [consultant] = await db
          .select({ contactPhone: consultants.contactPhone })
          .from(consultants)
          .where(eq(consultants.id, booking.providerId));
        if (consultant?.contactPhone) {
          console.log(`[Scheduler]   → Calling consultant: ${consultant.contactPhone}`);
          triggerVoiceCall(consultant.contactPhone, consultantMsg).catch((e) =>
            console.error("[Scheduler] Consultant call failed:", e?.message)
          );
        } else {
          console.log(`[Scheduler]   → No consultant phone on record`);
        }
      }

      // Call seeker
      if (booking.patientContact) {
        console.log(`[Scheduler]   → Calling seeker: ${booking.patientContact}`);
        triggerVoiceCall(booking.patientContact, seekerMsg).catch((e) =>
          console.error("[Scheduler] Seeker call failed:", e?.message)
        );
      } else {
        console.log(`[Scheduler]   → No seeker contact on record`);
      }

      // Call admin
      if (ADMIN_PHONE) {
        console.log(`[Scheduler]   → Calling admin: ${ADMIN_PHONE}`);
        triggerVoiceCall(ADMIN_PHONE, adminMsg).catch((e) =>
          console.error("[Scheduler] Admin call failed:", e?.message)
        );
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] Job error:", err?.message || err);
  }
}

/**
 * Start the consultation appointment reminder scheduler.
 * Fires every 60 seconds. Safe to call once at server startup.
 */
export function startConsultationScheduler(): void {
  // Run once immediately on startup so we don't miss the first minute
  fireAppointmentReminders();
  // Then run every 60 seconds
  setInterval(() => {
    fireAppointmentReminders();
  }, 60_000);
  console.log("[Scheduler] Consultation appointment reminder scheduler started (setInterval 60s).");
}
