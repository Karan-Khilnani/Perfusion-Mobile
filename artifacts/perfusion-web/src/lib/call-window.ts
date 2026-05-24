/**
 * Client-side call window calculation — mirrors server/services/call-window.ts.
 * Pure date math, no API call needed (booking already has appointmentSlot +
 * callWindowExtendedUntil from the query).
 */

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const DAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

export type CallWindowReason =
  | "always_open"
  | "before_window"
  | "active"
  | "expired"
  | "extended";

export interface CallWindowStatus {
  open: boolean;
  reason: CallWindowReason;
  windowStart: Date | null;
  windowEnd: Date | null;
  extendedUntil: Date | null;
}

function parseFullDateSlot(slot: string): { start: Date; end: Date } | null {
  if (!/\d{4}/.test(slot)) return null;
  const parts = slot.split(/[–—]/);
  if (parts.length < 2) return null;

  const startRaw = parts[0].trim();
  const endTimeRaw = parts[1].trim();
  const withoutDow = startRaw.replace(/^[A-Za-z]+,\s*/, "").trim();
  const normalized = withoutDow.replace(/,\s*/, " ").trim();

  let startDate = new Date(normalized + " +05:30");
  if (isNaN(startDate.getTime())) {
    startDate = new Date(normalized);
    if (isNaN(startDate.getTime())) return null;
  }

  const endMatch = endTimeRaw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!endMatch) return null;
  let eh = parseInt(endMatch[1], 10);
  const em = parseInt(endMatch[2], 10);
  const eampm = endMatch[3].toLowerCase();
  if (eampm === "pm" && eh !== 12) eh += 12;
  if (eampm === "am" && eh === 12) eh = 0;

  const startISTProxy = new Date(startDate.getTime() + IST_OFFSET_MS);
  const endISTProxy = new Date(startISTProxy);
  endISTProxy.setUTCHours(eh, em, 0, 0);
  // If end falls at or before start (e.g. 11:30 PM – 12:00 AM crosses midnight), advance by one day
  if (endISTProxy <= startISTProxy) {
    endISTProxy.setUTCDate(endISTProxy.getUTCDate() + 1);
  }
  const endDate = new Date(endISTProxy.getTime() - IST_OFFSET_MS);

  return { start: startDate, end: endDate };
}

function parseLegacySlot(slot: string): { start: Date; end: Date } | null {
  const match = slot.match(
    /^(sun|mon|tue|wed|thu|fri|sat|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(\d{1,2}):(\d{2})\s*(am|pm)/i
  );
  if (!match) return null;

  const dayKey = match[1].toLowerCase();
  const targetDow = DAY_MAP[dayKey];
  if (targetDow === undefined) return null;

  let istH = parseInt(match[2], 10);
  const istM = parseInt(match[3], 10);
  const ampm = match[4].toLowerCase();
  if (ampm === "pm" && istH !== 12) istH += 12;
  if (ampm === "am" && istH === 12) istH = 0;

  const now = new Date();
  const nowISTms = now.getTime() + IST_OFFSET_MS;
  const nowISTProxy = new Date(nowISTms);
  const currentDowIST = nowISTProxy.getUTCDay();
  const diff = targetDow - currentDowIST;

  const targetISTProxy = new Date(nowISTms);
  targetISTProxy.setUTCDate(nowISTProxy.getUTCDate() + diff);
  targetISTProxy.setUTCHours(istH, istM, 0, 0);

  const start = new Date(targetISTProxy.getTime() - IST_OFFSET_MS);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start, end };
}

export function getCallWindow(booking: {
  appointmentSlot?: string | null;
  callWindowExtendedUntil?: string | Date | null;
}): CallWindowStatus {
  const now = new Date();
  const slot = booking.appointmentSlot || "";
  const extendedUntil = booking.callWindowExtendedUntil
    ? new Date(booking.callWindowExtendedUntil as string)
    : null;

  if (!slot || slot.toLowerCase().includes("emergency") || slot.toLowerCase().includes("immediate")) {
    return { open: true, reason: "always_open", windowStart: null, windowEnd: null, extendedUntil };
  }

  const windowInfo = parseFullDateSlot(slot) || parseLegacySlot(slot);
  if (!windowInfo) {
    return { open: true, reason: "always_open", windowStart: null, windowEnd: null, extendedUntil };
  }

  const { start, end } = windowInfo;

  if (now >= start && now <= end) {
    return { open: true, reason: "active", windowStart: start, windowEnd: end, extendedUntil };
  }

  if (extendedUntil && !isNaN(extendedUntil.getTime()) && now <= extendedUntil) {
    return { open: true, reason: "extended", windowStart: start, windowEnd: end, extendedUntil };
  }

  if (now < start) {
    return { open: false, reason: "before_window", windowStart: start, windowEnd: end, extendedUntil };
  }

  return { open: false, reason: "expired", windowStart: start, windowEnd: end, extendedUntil };
}

/** Format a Date as IST time string like "10:30 AM" */
export function toISTTimeString(date: Date): string {
  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Returns a short human label for the Join Call button state */
export function callWindowLabel(status: CallWindowStatus): string {
  switch (status.reason) {
    case "before_window":
      return status.windowStart
        ? `Opens at ${toISTTimeString(status.windowStart)}`
        : "Not yet open";
    case "expired":
      return "Slot has ended";
    case "active":
    case "extended":
    case "always_open":
      return "Join Video Room";
  }
}
