import { db } from "../db";
import { bookings, consultants, providers } from "../../shared/schema";
import { eq, and, inArray } from "drizzle-orm";
import { triggerVoiceCall } from "./msg91";

const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || "";

// IST = UTC+5:30
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

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
 * Format a Date as IST time string for logging.
 */
function toISTString(d: Date): string {
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
}

/**
 * Parse an appointmentSlot string in any of these formats:
 *   "Thu, 15 May 2026, 10:00 AM – 11:00 AM"   (full date — calendar booking)
 *   "Mon 10:00 AM"                              (legacy — day+time only)
 *   "Monday 10:00 AM"
 *   "Emergency - Immediate"                     → null (no time)
 *
 * ALL times in slot labels are IST (the browser generates them in local time).
 * This function always returns a UTC Date that correctly represents the IST
 * slot time so that comparing it with new Date() (also UTC) works correctly.
 */
function parseSlotStart(slot: string): Date | null {
  if (!slot || slot.toLowerCase().includes("emergency") || slot.toLowerCase().includes("immediate")) {
    return null;
  }

  const now = new Date(); // UTC

  // ── Format 1: full date string with a year ──────────────────────────────
  // "Thu, 15 May 2026, 10:00 AM – 11:00 AM"  →  strip day prefix & end range
  const beforeDash = slot.split(/[–—]|(?<!\d)-(?!\d)/)[0].trim();
  const withoutDow = beforeDash.replace(/^[A-Za-z]+,\s*/, "").trim(); // remove "Thu, "
  const normalized = withoutDow.replace(/,\s*/, " ").trim();          // "15 May 2026 10:00 AM"
  if (/\d{4}/.test(normalized)) {
    // Append IST offset so V8 treats the local time as IST, not UTC
    const parsed = new Date(normalized + " +05:30");
    if (!isNaN(parsed.getTime())) return parsed;
    // Fallback without offset (legacy data already stored as UTC)
    const fallback = new Date(normalized);
    if (!isNaN(fallback.getTime())) return fallback;
  }

  // ── Format 2: "Mon 10:00 AM" or "Monday 09:30 AM" ───────────────────────
  const shortMatch = slot.match(
    /^(sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(\d{1,2}):(\d{2})\s*(am|pm)/i
  );
  if (shortMatch) {
    const dayKey = shortMatch[1].toLowerCase();
    const targetDow = DAY_MAP[dayKey]; // intended day-of-week in IST
    if (targetDow === undefined) return null;

    let istH = parseInt(shortMatch[2], 10);
    const istM = parseInt(shortMatch[3], 10);
    const ampm = shortMatch[4].toLowerCase();
    if (ampm === "pm" && istH !== 12) istH += 12;
    if (ampm === "am" && istH === 12) istH = 0;

    // Work in "IST virtual UTC" — shift now into IST, do calendar math, shift back
    const nowISTms = now.getTime() + IST_OFFSET_MS;
    const nowISTProxy = new Date(nowISTms); // UTC methods now give IST values

    const currentDowIST = nowISTProxy.getUTCDay();
    const diff = targetDow - currentDowIST; // may be negative (earlier this week)

    const targetISTProxy = new Date(nowISTms);
    targetISTProxy.setUTCDate(nowISTProxy.getUTCDate() + diff);
    targetISTProxy.setUTCHours(istH, istM, 0, 0);

    // Shift back to real UTC
    return new Date(targetISTProxy.getTime() - IST_OFFSET_MS);
  }

  return null;
}

/**
 * Returns true when two Dates fall in the same UTC minute (epoch-based).
 * Timezone-agnostic — both dates are internally UTC so this is always correct.
 */
function sameMinute(a: Date, b: Date): boolean {
  return Math.floor(a.getTime() / 60000) === Math.floor(b.getTime() / 60000);
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
    console.log(`[Scheduler] Tick — ${toISTString(now)} IST | ${activeBookings.length} active consultation booking(s) checked`);

    for (const booking of activeBookings) {
      if (remindedBookingIds.has(booking.id)) continue;
      if (!booking.appointmentSlot) continue;

      const slotStart = parseSlotStart(booking.appointmentSlot);

      if (!slotStart) {
        console.log(`[Scheduler]   Booking ${booking.bookingNumber || booking.id}: slot "${booking.appointmentSlot}" — cannot parse, skipping`);
        continue;
      }

      const matches = sameMinute(slotStart, now);
      console.log(`[Scheduler]   Booking ${booking.bookingNumber || booking.id}: slot "${booking.appointmentSlot}" → IST ${toISTString(slotStart)} | match=${matches}`);

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
          .select({
            contactPhone: consultants.contactPhone,
            providerId: consultants.providerId,
          })
          .from(consultants)
          .where(eq(consultants.id, booking.providerId));

        let consultantPhone = consultant?.contactPhone || null;

        // Fall back to provider's own phone if consultant has no direct contact phone
        if (!consultantPhone && consultant?.providerId) {
          const [prov] = await db
            .select({ phone: providers.phone })
            .from(providers)
            .where(eq(providers.id, consultant.providerId));
          consultantPhone = prov?.phone || null;
        }

        if (consultantPhone) {
          console.log(`[Scheduler]   → Calling consultant: ${consultantPhone}`);
          triggerVoiceCall(consultantPhone, consultantMsg).catch((e) =>
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
