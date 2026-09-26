export type ConsultantAvailabilityInput = {
  status?: string | null;
  availabilityFrom?: string | null;
  availabilityTo?: string | null;
  availableDays?: string[] | null;
  availableSlots?: string[] | null;
  slotSeries?: { days: string[]; from: string; to: string }[] | null;
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

    const dateWindows = override
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