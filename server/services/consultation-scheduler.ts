import cron from "node-cron";
import { db } from "../db";
import { bookings, consultants } from "../../shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { triggerVoiceCall } from "./msg91";

const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || "";

// Tracks booking IDs that have already had appointment reminders fired
// this server session, so we never double-call anyone.
const remindedBookingIds = new Set<string>();

/**
 * Parse an appointmentSlot string like:
 *   "Mon, 15 May 2026, 10:00 AM – 11:00 AM"
 * and return a Date for the start time, or null if it can't be parsed.
 */
function parseSlotStart(slot: string): Date | null {
  if (!slot) return null;
  try {
    // Take the part before the dash/en-dash separator
    const beforeDash = slot.split(/[–-]/)[0].trim();
    // beforeDash looks like: "Mon, 15 May 2026, 10:00 AM"
    // Drop the day-of-week prefix ("Mon, ") — Date.parse doesn't need it
    const withoutDow = beforeDash.replace(/^[A-Za-z]{2,9},\s*/, "").trim();
    // withoutDow: "15 May 2026, 10:00 AM"  — remove the comma before time
    const normalized = withoutDow.replace(",", "");
    const parsed = new Date(normalized);
    if (isNaN(parsed.getTime())) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Fire Twilio voice calls to the consultant, seeker, and admin
 * reminding them that the consultation is about to start.
 */
async function fireAppointmentReminders(): Promise<void> {
  try {
    // Fetch consultation bookings that are active (not yet completed/cancelled)
    const activeBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingType, "consultation"),
          inArray(bookings.status, ["booked", "confirmed"])
        )
      );

    if (!activeBookings.length) return;

    const now = new Date();
    const nowMin = now.getFullYear() * 525600 +
      (now.getMonth()) * 43800 +
      now.getDate() * 1440 +
      now.getHours() * 60 +
      now.getMinutes();

    for (const booking of activeBookings) {
      if (remindedBookingIds.has(booking.id)) continue;
      if (!booking.appointmentSlot) continue;

      const slotStart = parseSlotStart(booking.appointmentSlot);
      if (!slotStart) continue;

      const slotMin = slotStart.getFullYear() * 525600 +
        (slotStart.getMonth()) * 43800 +
        slotStart.getDate() * 1440 +
        slotStart.getHours() * 60 +
        slotStart.getMinutes();

      // Only fire if the slot start is within the current minute
      if (slotMin !== nowMin) continue;

      remindedBookingIds.add(booking.id);

      const patientName = booking.patientName || "Patient";
      const bookingRef = booking.bookingNumber || booking.id;

      console.log(`[Scheduler] Firing appointment reminders for booking ${bookingRef}`);

      // Build voice messages
      const consultantMsg =
        `Hello. This is a reminder from Perfusion Healthcare. ` +
        `Your consultation with ${patientName} is scheduled to start now. ` +
        `Booking reference ${bookingRef}. ` +
        `Please log in to the Perfusion portal to join the call.`;

      const seekerMsg =
        `Hello. This is a reminder from Perfusion Healthcare. ` +
        `Your consultation is scheduled to start now. ` +
        `Booking reference ${bookingRef}. ` +
        `Please log in to the Perfusion portal to join the call.`;

      const adminMsg =
        `Hello. This is a reminder from Perfusion Healthcare. ` +
        `Consultation booking ${bookingRef} for ${patientName} is starting now.`;

      // Look up consultant phone
      if (booking.providerId) {
        const [consultant] = await db
          .select({ contactPhone: consultants.contactPhone })
          .from(consultants)
          .where(eq(consultants.id, booking.providerId));
        if (consultant?.contactPhone) {
          triggerVoiceCall(consultant.contactPhone, consultantMsg).catch((e) =>
            console.error("[Scheduler] Consultant call failed:", e?.message)
          );
        }
      }

      // Call the seeker
      if (booking.patientContact) {
        triggerVoiceCall(booking.patientContact, seekerMsg).catch((e) =>
          console.error("[Scheduler] Seeker call failed:", e?.message)
        );
      }

      // Call admin
      if (ADMIN_PHONE) {
        triggerVoiceCall(ADMIN_PHONE, adminMsg).catch((e) =>
          console.error("[Scheduler] Admin call failed:", e?.message)
        );
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] Appointment reminder job error:", err?.message || err);
  }
}

/**
 * Start the consultation appointment reminder cron job.
 * Runs every minute. Safe to call once at server startup.
 */
export function startConsultationScheduler(): void {
  cron.schedule("* * * * *", () => {
    fireAppointmentReminders();
  });
  console.log("[Scheduler] Consultation appointment reminder scheduler started.");
}
