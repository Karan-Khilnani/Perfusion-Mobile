const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const LIFECYCLE_WINDOW_MS = 24 * 60 * 60 * 1000;

export type ConsultationLifecycleStatus =
  | "scheduled"
  | "ongoing"
  | "paused"
  | "completed"
  | "cancelled";

export interface ConsultationLifecycleBooking {
  bookingType?: string | null;
  status?: string | null;
  appointmentSlot?: string | null;
}

export interface ConsultationLifecycle {
  status: ConsultationLifecycleStatus;
  scheduleAvailable: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

function makeIstDate(year: number, month: number, day: number, hour: number, minute: number): Date | null {
  if (
    !Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) ||
    !Number.isInteger(hour) || !Number.isInteger(minute) ||
    month < 0 || month > 11 || day < 1 || hour < 0 || hour > 23 ||
    minute < 0 || minute > 59
  ) {
    return null;
  }

  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  if (day > maxDay) return null;

  return new Date(Date.UTC(year, month, day, hour, minute) - IST_OFFSET_MS);
}

function parseClock(hourText: string, minuteText: string, meridiem?: string): [number, number] | null {
  let hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const pm = meridiem.toLowerCase() === "pm";
    hour = (hour % 12) + (pm ? 12 : 0);
  } else if (hour < 0 || hour > 23) {
    return null;
  }

  return [hour, minute];
}

/**
 * Parse a saved full-date appointment slot. Legacy weekday-only and emergency
 * labels do not identify an exact date, so they intentionally fail closed.
 */
export function parseConsultationStart(appointmentSlot?: string | null): Date | null {
  const slot = appointmentSlot?.trim();
  if (!slot || /emergency|immediate/i.test(slot)) return null;

  const startText = slot.split(/[–—]|\s+-\s+/, 1)[0].trim();

  // ISO schedules with an explicit timezone are already unambiguous.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(startText)) {
    const parsed = new Date(startText);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  // ISO-like schedules without an offset are interpreted as IST.
  const isoLocal = startText.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
  if (isoLocal) {
    const parsed = makeIstDate(
      Number(isoLocal[1]),
      Number(isoLocal[2]) - 1,
      Number(isoLocal[3]),
      Number(isoLocal[4]),
      Number(isoLocal[5]),
    );
    return parsed;
  }

  const normalized = startText.replace(/^[A-Za-z]{3,9},\s*/, "").trim();
  const dayFirst = normalized.match(
    /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );
  const monthFirst = normalized.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i,
  );

  const match = dayFirst || monthFirst;
  if (!match) return null;

  const day = Number(dayFirst ? match[1] : match[2]);
  const monthName = (dayFirst ? match[2] : match[1]).toLowerCase();
  const year = Number(dayFirst ? match[3] : match[3]);
  const clock = parseClock(dayFirst ? match[4] : match[4], dayFirst ? match[5] : match[5], match[6]);
  const month = MONTHS[monthName];
  if (month === undefined || !clock) return null;

  return makeIstDate(year, month, day, clock[0], clock[1]);
}

export function resolveConsultationLifecycle(
  booking: ConsultationLifecycleBooking,
  now = new Date(),
): ConsultationLifecycle {
  const storedStatus = String(booking.status || "").toLowerCase();
  const startsAt = parseConsultationStart(booking.appointmentSlot);
  const expiresAt = startsAt ? new Date(startsAt.getTime() + LIFECYCLE_WINDOW_MS) : null;

  if (storedStatus === "cancelled" || storedStatus === "rejected") {
    return { status: "cancelled", scheduleAvailable: !!startsAt, startsAt, expiresAt };
  }
  if (storedStatus === "completed" || storedStatus === "report_ready") {
    return { status: "completed", scheduleAvailable: !!startsAt, startsAt, expiresAt };
  }
  if (!startsAt || !expiresAt) {
    return { status: "scheduled", scheduleAvailable: false, startsAt: null, expiresAt: null };
  }
  if (now.getTime() >= expiresAt.getTime()) {
    return { status: "completed", scheduleAvailable: true, startsAt, expiresAt };
  }
  if (now.getTime() < startsAt.getTime()) {
    return { status: "scheduled", scheduleAvailable: true, startsAt, expiresAt };
  }

  return {
    status: storedStatus === "paused" ? "paused" : "ongoing",
    scheduleAvailable: true,
    startsAt,
    expiresAt,
  };
}