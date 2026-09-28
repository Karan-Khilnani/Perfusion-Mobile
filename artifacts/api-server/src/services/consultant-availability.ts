import { parseConsultationStart } from "./consultation-lifecycle";

export type ConsultantAvailabilityInput = {
  status?: string | null;
  availabilityFrom?: string | null;
  availabilityTo?: string | null;
  availableDays?: string[] | null;
  availableSlots?: string[] | null;
  slotSeries?: { days: string[]; from: string; to: string; paused?: boolean; disabled?: boolean }[] | null;
};

export type ConsultantSlotOverrideInput = {
  date: string;
  isPaused: boolean;
  customFrom?: string | null;
  customTo?: string | null;
};

export type AvailabilityPreviewWindow = {
  from: string;
  to: string;
  appointmentSlot: string;
};

export type AvailabilityPreview = {
  label: string | null;
  date: string | null;
  windows: AvailabilityPreviewWindow[];
};

export type BookableSlot = {
  date: string;
  start: string;
  end: string;
  appointmentSlot: string;
};

export type BookableSlotsDate = {
  date: string;
  slots: BookableSlot[];
};

const TIME_ZONE = "Asia/Kolkata";
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_ALIASES: Record<string, string> = {
  Sunday: "Sun",
  Monday: "Mon",
  Tuesday: "Tue",
  Wednesday: "Wed",
  Thursday: "Thu",
  Friday: "Fri",
  Saturday: "Sat",
};

type TimeWindow = { from: string; to: string };

function getIstParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function parseTimeMinutes(value: string): number {
  const match = value.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) return -1;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3].toUpperCase();
  if (hour < 1 || hour > 12 || minute > 59) return -1;
  if (meridiem === "PM" && hour !== 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour * 60 + minute;
}

function normalizeDay(day: string): string {
  const trimmed = day.trim();
  const canonical = trimmed.length
    ? trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase()
    : "";
  if (canonical in DAY_ALIASES) return DAY_ALIASES[canonical];
  const short = canonical.slice(0, 3);
  return SHORT_DAYS.includes(short) ? short : "";
}

function getWeeklyWindows(config: ConsultantAvailabilityInput): Map<string, TimeWindow[]> {
  const windowsByDay = new Map<string, TimeWindow[]>();

  if (config.slotSeries && config.slotSeries.length > 0) {
    for (const series of config.slotSeries) {
      if (series.paused || series.disabled) continue;
      for (const rawDay of series.days ?? []) {
        const day = normalizeDay(rawDay);
        if (!day) continue;
        const windows = windowsByDay.get(day) ?? [];
        windows.push({ from: series.from, to: series.to });
        windowsByDay.set(day, windows);
      }
    }
    return windowsByDay;
  }

  if (config.availableSlots && config.availableSlots.length > 0) {
    for (const slot of config.availableSlots) {
      const dayMatch = slot.match(/^\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*,?\s+(.+?)\s*$/i);
      if (!dayMatch) continue;
      const day = normalizeDay(dayMatch[1]);
      const times = dayMatch[2].match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)/gi) ?? [];
      if (!day || times.length === 0) continue;
      const windows = windowsByDay.get(day) ?? [];
      windows.push({ from: times[0] ?? "", to: times[1] ?? "" });
      windowsByDay.set(day, windows);
    }
    return windowsByDay;
  }

  const from = config.availabilityFrom ?? "";
  if (config.availableDays?.length && from) {
    for (const rawDay of config.availableDays) {
      const day = normalizeDay(rawDay);
      if (!day) continue;
      windowsByDay.set(day, [...(windowsByDay.get(day) ?? []), {
        from,
        to: config.availabilityTo ?? "",
      }]);
    }
  }
  return windowsByDay;
}

function formatClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatAppointmentClock(minutes: number): string {
  if (minutes === 1440) return "12:00 AM";
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hour24 >= 12 ? "PM" : "AM"}`;
}

function mergeWindows(windows: TimeWindow[]): Array<{ from: number; to: number }> {
  const parsed = windows
    .map((window) => {
      const from = parseTimeMinutes(window.from);
      let to = parseTimeMinutes(window.to);
      if (to === 0 && from > 0) to = 1440;
      return { from, to };
    })
    .filter((window) => window.from >= 0 && window.to > window.from)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Array<{ from: number; to: number }> = [];
  for (const window of parsed) {
    const previous = merged[merged.length - 1];
    if (previous && window.from <= previous.to) {
      previous.to = Math.max(previous.to, window.to);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

function getDateParts(dateString: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function dateAtIstMinutes(dateString: string, minutes: number): Date {
  const parts = getDateParts(dateString)!;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, Math.floor(minutes / 60), minutes % 60) - (5 * 60 + 30) * 60_000);
}

/**
 * Build 30-minute, server-computed appointment choices from the weekly schedule.
 * Booked entries may be any consultation booking with a parseable full-date slot.
 */
export function getConsultantBookableSlots(
  consultant: ConsultantAvailabilityInput,
  overrides: ConsultantSlotOverrideInput[],
  bookedConsultations: Array<{ status?: string | null; appointmentSlot?: string | null }>,
  startDate: string,
  endDate: string,
  now = new Date(),
): BookableSlotsDate[] {
  if (consultant.status !== "active") return [];
  const firstParts = getDateParts(startDate);
  const lastParts = getDateParts(endDate);
  if (!firstParts || !lastParts) return [];
  const firstDay = Date.UTC(firstParts.year, firstParts.month - 1, firstParts.day);
  const lastDay = Date.UTC(lastParts.year, lastParts.month - 1, lastParts.day);
  const dayCount = Math.floor((lastDay - firstDay) / 86_400_000) + 1;
  if (dayCount < 1 || dayCount > 30) return [];

  const weeklyWindows = getWeeklyWindows(consultant);
  const nowIst = getIstParts(now);
  const todayString = formatDate(nowIst.year, nowIst.month, nowIst.day);
  const bookedIntervals = bookedConsultations
    .filter((booking) => !["cancelled", "rejected"].includes(String(booking.status ?? "").toLowerCase()))
    .map((booking) => {
      const parsed = parseConsultationStart(booking.appointmentSlot);
      if (!parsed) return null;
      let durationMinutes = 30;
      const slotLabel = booking.appointmentSlot ?? "";
      const separator = /[–—]|\s+-\s+/.exec(slotLabel);
      if (separator && separator.index !== undefined) {
        const startText = slotLabel.slice(0, separator.index);
        const endText = slotLabel.slice(separator.index + separator[0].length);
        const clockPattern = /\d{1,2}(?::\d{2})?\s*(?:AM|PM)/i;
        const startClock = startText.match(clockPattern)?.[0];
        const endClock = endText.match(clockPattern)?.[0];
        const startMinutes = startClock ? parseTimeMinutes(startClock) : -1;
        const endMinutes = endClock ? parseTimeMinutes(endClock) : -1;
        if (startMinutes >= 0 && endMinutes > startMinutes) durationMinutes = endMinutes - startMinutes;
      }
      return { start: parsed.getTime(), end: parsed.getTime() + durationMinutes * 60_000 };
    })
    .filter((interval): interval is { start: number; end: number } => interval !== null);
  const slotsByDate: BookableSlotsDate[] = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const day = new Date(firstDay + offset * 86_400_000);
    const date = formatDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
    if (date < todayString) continue;
    const weekday = SHORT_DAYS[day.getUTCDay()];
    const scheduledWindows = weeklyWindows.get(weekday) ?? [];
    if (!scheduledWindows.length) continue;

    const override = overrides.find((item) => item.date === date);
    if (override?.isPaused) continue;
    const dateWindows = override && (override.customFrom || override.customTo)
      ? [{
          from: override.customFrom || consultant.availabilityFrom || scheduledWindows[0].from,
          to: override.customTo || consultant.availabilityTo || scheduledWindows[0].to,
        }]
      : scheduledWindows;
    const mergedWindows = mergeWindows(dateWindows);
    const dateLabel = formatIstDateLabel(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
    const slots: BookableSlot[] = [];

    for (const window of mergedWindows) {
      for (let start = window.from; start + 30 <= window.to; start += 30) {
        const end = start + 30;
        const startInstant = dateAtIstMinutes(date, start).getTime();
        if (startInstant <= now.getTime()) continue;
        if (bookedIntervals.some((booked) => startInstant < booked.end && startInstant + 30 * 60_000 > booked.start)) continue;
        const formattedStart = formatAppointmentClock(start);
        const formattedEnd = formatAppointmentClock(end);
        slots.push({
          date,
          start: formatClock(start),
          end: formatClock(end),
          appointmentSlot: `${dateLabel}, ${formattedStart} – ${formattedEnd}`,
        });
      }
    }
    if (slots.length) slotsByDate.push({ date, slots });
  }
  return slotsByDate;
}

function formatIstDateLabel(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDate(year: number, month: number, day: number): string {
  const normalized = new Date(Date.UTC(year, month - 1, day));
  return `${normalized.getUTCFullYear()}-${String(normalized.getUTCMonth() + 1).padStart(2, "0")}-${String(normalized.getUTCDate()).padStart(2, "0")}`;
}

function isEligibleToday(window: TimeWindow, nowMinutes: number): boolean {
  const fromMinutes = parseTimeMinutes(window.from);
  if (fromMinutes < 0) return false;
  const toMinutes = parseTimeMinutes(window.to);
  const cutoff = toMinutes >= 0 ? toMinutes - 15 : fromMinutes;
  return cutoff > nowMinutes;
}

export function getConsultantAvailabilityPreview(
  consultant: ConsultantAvailabilityInput,
  overrides: ConsultantSlotOverrideInput[] = [],
  now = new Date(),
): AvailabilityPreview {
  if (consultant.status !== "active") {
    return { label: null, date: null, windows: [] };
  }

  const weeklyWindows = getWeeklyWindows(consultant);
  if (weeklyWindows.size === 0) {
    return { label: null, date: null, windows: [] };
  }

  const ist = getIstParts(now);
  const todayIndex = SHORT_DAYS.indexOf(ist.weekday);
  if (todayIndex < 0) return { label: null, date: null, windows: [] };

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(Date.UTC(ist.year, ist.month - 1, ist.day + offset, 12));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const dayNumber = date.getUTCDate();
    const dateString = formatDate(year, month, dayNumber);
    const dayName = SHORT_DAYS[date.getUTCDay()];
    const scheduledWindows = weeklyWindows.get(dayName);
    if (!scheduledWindows?.length) continue;

    const override = overrides.find((item) => item.date === dateString);
    if (override?.isPaused) continue;

    const dateWindows = override && (override.customFrom || override.customTo)
      ? [{
          from: override.customFrom || consultant.availabilityFrom || scheduledWindows[0].from,
          to: override.customTo || consultant.availabilityTo || scheduledWindows[0].to,
        }]
      : scheduledWindows;

    const eligibleWindows = (offset === 0
      ? dateWindows.filter((window) => isEligibleToday(window, ist.minutes))
      : dateWindows.filter((window) => parseTimeMinutes(window.from) >= 0))
      .sort((a, b) => parseTimeMinutes(a.from) - parseTimeMinutes(b.from));

    if (eligibleWindows.length === 0) continue;

    const label = offset === 0
      ? "Available Today"
      : offset === 1
        ? "Available Tomorrow"
        : `Available next ${FULL_DAYS[date.getUTCDay()]}`;
    const dateLabel = formatIstDateLabel(year, month, dayNumber);
    return {
      label,
      date: dateString,
      windows: eligibleWindows.map(({ from, to }) => ({
        from,
        to,
        appointmentSlot: `${dateLabel}, ${from}${to ? ` – ${to}` : ""}`,
      })),
    };
  }

  return { label: null, date: null, windows: [] };
}