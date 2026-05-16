import { db } from "../db";
import { bookings, consultants, providers } from "../../shared/schema";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { triggerVoiceCall } from "./msg91";

const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || "";

// IST = UTC+5:30
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// 10-minute catch-up window — fires reminders for slots that occurred up to
// 10 minutes ago so that server restarts during a slot window don't cause misses.
const CATCHUP_WINDOW_MS = 10 * 60 * 1000;

// In-memory dedup for the current server session (fast-path — avoids extra
// DB round-trips for slots already fired in this process lifetime).
const firedThisSession = new Set<string>();

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
 *   "Sat, 16 May 2026, 12:30 PM – 01:30 PM"  (full date — calendar booking)
 *   "Mon 10:00 AM"                              (legacy — day+time only)
 *   "Monday 10:00 AM"
 *   "Emergency - Immediate"                     → null (no time)
 *
 * ALL times in slot labels are IST.
 * Returns a UTC Date correctly representing the IST slot time.
 */
function parseSlotStart(slot: string): Date | null {
  if (!slot || slot.toLowerCase().includes("emergency") || slot.toLowerCase().includes("immediate")) {
    return null;
  }

  const now = new Date(); // UTC

  // ── Format 1: full date string with a 4-digit year ──────────────────────
  // "Sat, 16 May 2026, 12:30 PM – 01:30 PM"  →  strip day prefix & end range
  const beforeDash = slot.split(/[–—]|(?<!\d)-(?!\d)/)[0].trim();
  const withoutDow = beforeDash.replace(/^[A-Za-z]+,\s*/, "").trim(); // remove "Sat, "
  const normalized = withoutDow.replace(/,\s*/, " ").trim();          // "16 May 2026 12:30 PM"
  if (/\d{4}/.test(normalized)) {
    const parsed = new Date(normalized + " +05:30");
    if (!isNaN(parsed.getTime())) return parsed;
    const fallback = new Date(normalized);
    if (!isNaN(fallback.getTime())) return fallback;
  }

  // ── Format 2: "Mon 10:00 AM" or "Monday 09:30 AM" ───────────────────────
  const shortMatch = slot.match(
    /^(sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(\d{1,2}):(\d{2})\s*(am|pm)/i
  );
  if (shortMatch) {
    const dayKey = shortMatch[1].toLowerCase();
    const targetDow = DAY_MAP[dayKey];
    if (targetDow === undefined) return null;

    let istH = parseInt(shortMatch[2], 10);
    const istM = parseInt(shortMatch[3], 10);
    const ampm = shortMatch[4].toLowerCase();
    if (ampm === "pm" && istH !== 12) istH += 12;
    if (ampm === "am" && istH === 12) istH = 0;

    // Work in "IST virtual UTC" — shift now into IST, do calendar math, shift back
    const nowISTms = now.getTime() + IST_OFFSET_MS;
    const nowISTProxy = new Date(nowISTms);

    const currentDowIST = nowISTProxy.getUTCDay();
    const diff = targetDow - currentDowIST;

    const targetISTProxy = new Date(nowISTms);
    targetISTProxy.setUTCDate(nowISTProxy.getUTCDate() + diff);
    targetISTProxy.setUTCHours(istH, istM, 0, 0);

    return new Date(targetISTProxy.getTime() - IST_OFFSET_MS);
  }

  return null;
}

/**
 * Fire Twilio voice calls to the consultant, seeker, and admin
 * when a consultation booking's slot time arrives.
 *
 * Uses DB-backed `reminderFiredAt` so the reminder fires exactly once
 * even if the server restarts mid-window. A 10-minute catch-up window
 * ensures a slot missed during a restart is still triggered promptly.
 */
async function fireAppointmentReminders(): Promise<void> {
  try {
    const activeBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingType, "consultation"),
          inArray(bookings.status, ["booked", "confirmed"]),
          isNull(bookings.reminderFiredAt)
        )
      );

    const now = new Date();
    const nowMs = now.getTime();
    console.log(`[Scheduler] Tick — ${toISTString(now)} IST | ${activeBookings.length} unfired consultation booking(s) checked`);

    for (const booking of activeBookings) {
      // Fast-path: already fired in this server session
      if (firedThisSession.has(booking.id)) continue;
      if (!booking.appointmentSlot) continue;

      const slotStart = parseSlotStart(booking.appointmentSlot);

      if (!slotStart) {
        console.log(`[Scheduler]   Booking ${booking.bookingNumber || booking.id}: slot "${booking.appointmentSlot}" — cannot parse, skipping`);
        continue;
      }

      const slotMs = slotStart.getTime();
      // Fire if slot is in the past (or right now) and within the 10-minute catch-up window
      const shouldFire = slotMs <= nowMs && slotMs >= nowMs - CATCHUP_WINDOW_MS;

      console.log(`[Scheduler]   Booking ${booking.bookingNumber || booking.id}: slot "${booking.appointmentSlot}" → IST ${toISTString(slotStart)} | fire=${shouldFire}`);

      if (!shouldFire) continue;

      await fireOneBooking(booking, now);
    }
  } catch (err: any) {
    console.error("[Scheduler] Job error:", err?.message || err, err?.stack);
  }
}

/**
 * Fire reminders for ONE booking. Each step is independently try/caught so
 * a failure in one outbound call never blocks the others or breaks the loop.
 * Exported so it can be invoked manually for testing.
 */
export async function fireOneBooking(booking: any, now: Date = new Date()): Promise<void> {
  const patientName = booking.patientName || "Patient";
  const bookingRef = booking.bookingNumber || booking.id;

  // Mark as fired in DB immediately to prevent re-firing
  try {
    firedThisSession.add(booking.id);
    await db.update(bookings)
      .set({ reminderFiredAt: now } as any)
      .where(eq(bookings.id, booking.id));
  } catch (e: any) {
    console.error(`[Scheduler] Failed to mark booking ${bookingRef} as fired:`, e?.message, e?.stack);
  }

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

  // ── Call consultant ────────────────────────────────────────────────────────
  // booking.serviceId is the consultants.id; booking.providerId is providers.id.
  // We prefer consultants.contactPhone, then fall back to providers.phone.
  try {
    let consultantPhone: string | null = null;

    if (booking.serviceId) {
      const [consultant] = await db
        .select({
          contactPhone: consultants.contactPhone,
          providerId: consultants.providerId,
        })
        .from(consultants)
        .where(eq(consultants.id, booking.serviceId));
      consultantPhone = consultant?.contactPhone || null;

      if (!consultantPhone && consultant?.providerId) {
        const [prov] = await db
          .select({ phone: providers.phone })
          .from(providers)
          .where(eq(providers.id, consultant.providerId));
        consultantPhone = prov?.phone || null;
      }
    }

    // Last-resort fallback: providers table directly via booking.providerId
    if (!consultantPhone && booking.providerId) {
      const [prov] = await db
        .select({ phone: providers.phone })
        .from(providers)
        .where(eq(providers.id, booking.providerId));
      consultantPhone = prov?.phone || null;
    }

    if (consultantPhone) {
      console.log(`[Scheduler]   → Calling consultant: ${consultantPhone}`);
      triggerVoiceCall(consultantPhone, consultantMsg).catch((e) =>
        console.error("[Scheduler] Consultant call failed:", e?.message)
      );
    } else {
      console.log(`[Scheduler]   → No consultant phone on record (serviceId=${booking.serviceId}, providerId=${booking.providerId})`);
    }
  } catch (e: any) {
    console.error("[Scheduler] Consultant lookup error:", e?.message, e?.stack);
  }

  // ── Call seeker ────────────────────────────────────────────────────────────
  try {
    if (booking.patientContact) {
      console.log(`[Scheduler]   → Calling seeker: ${booking.patientContact}`);
      triggerVoiceCall(booking.patientContact, seekerMsg).catch((e) =>
        console.error("[Scheduler] Seeker call failed:", e?.message)
      );
    } else {
      console.log(`[Scheduler]   → No seeker contact on record`);
    }
  } catch (e: any) {
    console.error("[Scheduler] Seeker step error:", e?.message, e?.stack);
  }

  // ── Call admin ─────────────────────────────────────────────────────────────
  try {
    if (ADMIN_PHONE) {
      console.log(`[Scheduler]   → Calling admin: ${ADMIN_PHONE}`);
      triggerVoiceCall(ADMIN_PHONE, adminMsg).catch((e) =>
        console.error("[Scheduler] Admin call failed:", e?.message)
      );
    } else {
      console.log(`[Scheduler]   → ADMIN_PHONE_NUMBER not set, skipping admin call`);
    }
  } catch (e: any) {
    console.error("[Scheduler] Admin step error:", e?.message, e?.stack);
  }
}

/**
 * Start the consultation appointment reminder scheduler.
 * Fires every 60 seconds. Safe to call once at server startup.
 */
export function startConsultationScheduler(): void {
  console.log("[Scheduler] Consultation appointment reminder scheduler started (setInterval 60s, 10-min catch-up window).");
  // Run immediately on startup — catches slots missed during restart (within 10-min window)
  fireAppointmentReminders();
  setInterval(() => {
    fireAppointmentReminders();
  }, 60_000);
}
