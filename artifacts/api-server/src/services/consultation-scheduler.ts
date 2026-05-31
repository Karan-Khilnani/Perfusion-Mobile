import { db } from "../db";
import { bookings, consultants, providers } from "@workspace/db";
import { users } from "@workspace/db";
import { eq, and, inArray, isNull } from "drizzle-orm";
import { triggerVoiceCall } from "./msg91";

const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || "";

// IST = UTC+5:30
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// Catch-up window — fires reminders for slots that occurred up to this long ago.
// Set to 2 hours so server restarts / short deployments don't permanently miss a slot.
const CATCHUP_WINDOW_MS = 2 * 60 * 60 * 1000;

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
 * Format a list of strings for speech: "A, B, and C".
 */
function formatList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Look up the phone number for a consultant via serviceId → consultants → providers.
 */
async function resolveConsultantPhone(booking: any): Promise<string | null> {
  let resolvedProviderId: string | null = null;

  if (booking.serviceId) {
    const [consultant] = await db
      .select({ providerId: consultants.providerId })
      .from(consultants)
      .where(eq(consultants.id, booking.serviceId));
    resolvedProviderId = consultant?.providerId || null;
  }

  if (!resolvedProviderId && booking.providerId) {
    resolvedProviderId = booking.providerId;
  }

  if (!resolvedProviderId) return null;

  const [prov] = await db
    .select({ phone: providers.phone })
    .from(providers)
    .where(eq(providers.id, resolvedProviderId));
  return prov?.phone || null;
}

/**
 * Mark a set of bookings as fired in DB and in-memory cache atomically
 * (best-effort — failures are logged, not thrown).
 */
async function markFired(bookingList: any[], now: Date): Promise<void> {
  for (const booking of bookingList) {
    firedThisSession.add(booking.id);
    try {
      await db.update(bookings)
        .set({ reminderFiredAt: now } as any)
        .where(eq(bookings.id, booking.id));
    } catch (e: any) {
      console.error(`[Scheduler] Failed to mark booking ${booking.bookingNumber || booking.id} as fired:`, e?.message);
    }
  }
}

/**
 * Fire reminders for a batch of bookings that share the same consultant and slot.
 * - One consolidated voice call to the consultant listing all patients.
 * - Individual voice calls to each seeker.
 * - One consolidated voice call to admin.
 */
async function fireBatchedBookings(batchBookings: any[], now: Date): Promise<void> {
  const refs = batchBookings.map(b => b.bookingNumber || b.id).join(", ");
  console.log(`[Scheduler] ★ FIRING batched reminders for ${batchBookings.length} booking(s): ${refs}`);

  const patientNames = batchBookings.map(b => b.patientName || "Patient");
  const patientList = formatList(patientNames);
  const count = batchBookings.length;

  await markFired(batchBookings, now);

  // ── Consultant call — one call, all patients listed ────────────────────────
  try {
    const consultantPhone = await resolveConsultantPhone(batchBookings[0]);
    if (consultantPhone) {
      const consultantMsg =
        `Hello. This is a reminder from Perfusion Healthcare. ` +
        `You have ${count} consultation${count > 1 ? "s" : ""} starting now. ` +
        `Patient${count > 1 ? "s" : ""}: ${patientList}. ` +
        `Please log in to the Perfusion portal to join the call${count > 1 ? "s" : ""}.`;
      console.log(`[Scheduler]   → Calling consultant (batch): ${consultantPhone}`);
      triggerVoiceCall(consultantPhone, consultantMsg).catch((e) =>
        console.error("[Scheduler] Consultant batch call failed:", e?.message)
      );
    } else {
      console.log(`[Scheduler]   → No consultant phone on record (serviceId=${batchBookings[0].serviceId})`);
    }
  } catch (e: any) {
    console.error("[Scheduler] Consultant batch lookup error:", e?.message, e?.stack);
  }

  // ── Seeker calls — individual per booking ─────────────────────────────────
  for (const booking of batchBookings) {
    try {
      let seekerPhone: string | null = null;
      if (booking.userId) {
        const [seekerUser] = await db
          .select({ phone: users.phone })
          .from(users)
          .where(eq(users.id, booking.userId));
        seekerPhone = seekerUser?.phone || null;
      }
      if (seekerPhone) {
        const seekerMsg =
          `Hello. This is a reminder from Perfusion Healthcare. ` +
          `Your consultation is scheduled to start now. ` +
          `Please log in to the Perfusion portal to join the call.`;
        console.log(`[Scheduler]   → Calling seeker (${booking.patientName || "patient"}): ${seekerPhone}`);
        triggerVoiceCall(seekerPhone, seekerMsg).catch((e) =>
          console.error("[Scheduler] Seeker call failed:", e?.message)
        );
      } else {
        console.log(`[Scheduler]   → No seeker phone (userId=${booking.userId})`);
      }
    } catch (e: any) {
      console.error("[Scheduler] Seeker lookup error:", e?.message, e?.stack);
    }
  }

  // ── Admin call — one consolidated call ────────────────────────────────────
  try {
    if (ADMIN_PHONE) {
      const adminMsg =
        count === 1
          ? `Hello. This is a Perfusion Healthcare reminder. ` +
            `Consultation for ${patientNames[0]} is starting now.`
          : `Hello. This is a Perfusion Healthcare reminder. ` +
            `${count} consultations are starting now. Patients: ${patientList}.`;
      console.log(`[Scheduler]   → Calling admin (batch): ${ADMIN_PHONE}`);
      triggerVoiceCall(ADMIN_PHONE, adminMsg).catch((e) =>
        console.error("[Scheduler] Admin batch call failed:", e?.message)
      );
    } else {
      console.log(`[Scheduler]   → ADMIN_PHONE_NUMBER not set, skipping admin call`);
    }
  } catch (e: any) {
    console.error("[Scheduler] Admin batch step error:", e?.message, e?.stack);
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

  await markFired([booking], now);

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
    `Consultation for ${patientName} is starting now.`;

  // ── Call consultant ────────────────────────────────────────────────────────
  try {
    const consultantPhone = await resolveConsultantPhone(booking);
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
    let seekerPhone: string | null = null;
    if (booking.userId) {
      const [seekerUser] = await db
        .select({ phone: users.phone })
        .from(users)
        .where(eq(users.id, booking.userId));
      seekerPhone = seekerUser?.phone || null;
    }
    if (seekerPhone) {
      console.log(`[Scheduler]   → Calling seeker: ${seekerPhone}`);
      triggerVoiceCall(seekerPhone, seekerMsg).catch((e) =>
        console.error("[Scheduler] Seeker call failed:", e?.message)
      );
    } else {
      console.log(`[Scheduler]   → No seeker phone on profile (userId=${booking.userId})`);
    }
  } catch (e: any) {
    console.error("[Scheduler] Seeker lookup error:", e?.message, e?.stack);
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
 * Fire Twilio voice calls to the consultant, seeker, and admin
 * when a consultation booking's slot time arrives.
 *
 * Bookings for the same consultant at the same slot are batched into
 * a single consolidated call to the consultant and admin:
 * - Pre-slot bookings (created before slot start) → batched together.
 * - During-slot bookings (created after slot start) → individual call each.
 *
 * Uses DB-backed `reminderFiredAt` so each booking fires exactly once
 * even across server restarts. 2-hour catch-up window handles restarts.
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

    // Collect bookings that should fire this tick
    type FireEntry = { booking: any; slotStart: Date; createdAtMs: number };
    const toFire: FireEntry[] = [];

    for (const booking of activeBookings) {
      if (firedThisSession.has(booking.id)) continue;
      if (!booking.appointmentSlot) continue;

      const slotStart = parseSlotStart(booking.appointmentSlot);
      if (!slotStart) {
        console.log(`[Scheduler]   Booking ${booking.bookingNumber || booking.id}: slot "${booking.appointmentSlot}" — cannot parse, skipping`);
        continue;
      }

      const slotMs = slotStart.getTime();
      const msUntilSlot = slotMs - nowMs;
      const msSinceSlot = nowMs - slotMs;
      const shouldFire = slotMs <= nowMs && slotMs >= nowMs - CATCHUP_WINDOW_MS;

      const reason = msUntilSlot > 0
        ? `in ${Math.round(msUntilSlot / 60000)}min`
        : msSinceSlot > CATCHUP_WINDOW_MS
        ? `missed — ${Math.round(msSinceSlot / 60000)}min ago (outside ${CATCHUP_WINDOW_MS / 60000}min window)`
        : `now — firing`;

      console.log(`[Scheduler]   Booking ${booking.bookingNumber || booking.id}: slot "${booking.appointmentSlot}" → IST ${toISTString(slotStart)} | fire=${shouldFire} (${reason})`);

      if (!shouldFire) continue;

      toFire.push({
        booking,
        slotStart,
        createdAtMs: new Date(booking.createdAt).getTime(),
      });
    }

    if (toFire.length === 0) return;

    // Group by consultant (serviceId) + slot start minute
    const groups = new Map<string, FireEntry[]>();
    for (const entry of toFire) {
      const slotMinute = Math.floor(entry.slotStart.getTime() / 60000);
      const groupKey = `${entry.booking.serviceId ?? "unknown"}::${slotMinute}`;
      if (!groups.has(groupKey)) groups.set(groupKey, []);
      groups.get(groupKey)!.push(entry);
    }

    for (const entries of groups.values()) {
      const slotMs = entries[0].slotStart.getTime();

      // Pre-slot: booking was created before the slot started
      const preSlot = entries.filter(e => e.createdAtMs <= slotMs).map(e => e.booking);
      // During-slot: booking was created after the slot started (new booking mid-session)
      const duringSlot = entries.filter(e => e.createdAtMs > slotMs).map(e => e.booking);

      if (preSlot.length === 1) {
        // Single pre-slot booking — use the simple individual path
        await fireOneBooking(preSlot[0], now);
      } else if (preSlot.length > 1) {
        // Multiple pre-slot bookings — batch into one consultant/admin call
        await fireBatchedBookings(preSlot, now);
      }

      // During-slot bookings always fire individually
      for (const booking of duringSlot) {
        await fireOneBooking(booking, now);
      }
    }
  } catch (err: any) {
    console.error("[Scheduler] Job error:", err?.message || err, err?.stack);
  }
}

/**
 * Start the consultation appointment reminder scheduler.
 * Fires every 60 seconds. Safe to call once at server startup.
 */
export function startConsultationScheduler(): void {
  console.log("[Scheduler] Consultation appointment reminder scheduler started (setInterval 60s, 2-hour catch-up window).");
  // Run immediately on startup — catches slots missed during restart (within 2-hour window)
  fireAppointmentReminders();
  setInterval(() => {
    fireAppointmentReminders();
  }, 60_000);
}
