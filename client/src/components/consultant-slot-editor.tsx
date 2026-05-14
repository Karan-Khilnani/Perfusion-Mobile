import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, CalendarDays, Info, Plus, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { SlotSeries } from "@shared/schema";

const TIMES = [
  "06:00 AM", "06:30 AM", "07:00 AM", "07:30 AM",
  "08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM",
  "10:00 AM", "10:30 AM", "11:00 AM", "11:30 AM",
  "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
  "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM",
  "04:00 PM", "04:30 PM", "05:00 PM", "05:30 PM",
  "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM",
  "08:00 PM", "08:30 PM", "09:00 PM", "09:30 PM",
  "10:00 PM",
];

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface ConsultantSlotEditorProps {
  consultantId: string;
  consultantName?: string;
  initialFrom?: string | null;
  initialTo?: string | null;
  initialDays?: string[] | null;
  initialSlotSeries?: SlotSeries[] | null;
  invalidateKeys?: string[][];
  onSaved?: () => void;
}

function seriesSummary(s: SlotSeries): string {
  const days = DAYS_OF_WEEK.filter(d => s.days.includes(d)).join(" · ");
  return `${days}: ${s.from} – ${s.to}`;
}

export function ConsultantSlotEditor({
  consultantId,
  consultantName,
  initialFrom,
  initialTo,
  initialDays,
  initialSlotSeries,
  invalidateKeys = [],
  onSaved,
}: ConsultantSlotEditorProps) {
  const { toast } = useToast();

  const [open, setOpen] = useState(false);

  // Series-based state for Default Schedule tab
  const [series, setSeries] = useState<SlotSeries[]>(() => {
    if (initialSlotSeries && initialSlotSeries.length > 0) return initialSlotSeries;
    if (initialDays && initialDays.length > 0 && initialFrom) {
      return [{ days: initialDays, from: initialFrom, to: initialTo || "05:00 PM" }];
    }
    return [];
  });
  const [draftDays, setDraftDays] = useState<string[]>([]);
  const [draftFrom, setDraftFrom] = useState("09:00 AM");
  const [draftTo, setDraftTo] = useState("05:00 PM");

  // Calendar override state
  const [calendarMonth, setCalendarMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [dayActionDate, setDayActionDate] = useState<string | null>(null);
  const [dayActionCustomFrom, setDayActionCustomFrom] = useState("09:00 AM");
  const [dayActionCustomTo, setDayActionCustomTo] = useState("05:00 PM");
  const [longPressTimer, setLongPressTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const { data: slotOverrides = [] } = useQuery<{ date: string; isPaused: boolean; customFrom?: string; customTo?: string }[]>({
    queryKey: ["/api/consultants", consultantId, "slot-overrides"],
    queryFn: async () => {
      const res = await fetch(`/api/consultants/${consultantId}/slot-overrides`, { credentials: "include" });
      return res.json();
    },
    enabled: !!consultantId && open,
  });

  const doInvalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/consultants", consultantId, "slot-overrides"] });
    invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
  };

  const updateSlotsMutation = useMutation({
    mutationFn: async (payload: { slotSeries: SlotSeries[]; availabilityFrom?: string; availabilityTo?: string; availableDays?: string[] }) => {
      const res = await apiRequest("PATCH", `/api/consultants/${consultantId}/slots`, payload);
      return res.json();
    },
    onSuccess: () => {
      doInvalidate();
      toast({ title: "Schedule Saved", description: "Default schedule has been updated." });
      setOpen(false);
      onSaved?.();
    },
    onError: () => {
      toast({ title: "Failed", description: "Could not save schedule.", variant: "destructive" });
    },
  });

  const upsertOverrideMutation = useMutation({
    mutationFn: async ({ date, isPaused, customFrom, customTo }: { date: string; isPaused: boolean; customFrom?: string; customTo?: string }) => {
      const res = await apiRequest("POST", `/api/consultants/${consultantId}/slot-overrides`, { date, isPaused, customFrom, customTo });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultants", consultantId, "slot-overrides"] });
    },
  });

  const deleteOverrideMutation = useMutation({
    mutationFn: async ({ date }: { date: string }) => {
      const res = await apiRequest("DELETE", `/api/consultants/${consultantId}/slot-overrides/${date}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultants", consultantId, "slot-overrides"] });
    },
  });

  // Draft series builder handlers
  const toggleDraftDay = (day: string) => {
    setDraftDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const lockInDraft = () => {
    if (draftDays.length === 0) {
      toast({ title: "Select days first", description: "Pick at least one day before adding.", variant: "destructive" });
      return;
    }
    setSeries(prev => [...prev, { days: [...draftDays], from: draftFrom, to: draftTo }]);
    setDraftDays([]);
  };

  const removeSeries = (idx: number) => {
    setSeries(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveSchedule = () => {
    const first = series[0];
    updateSlotsMutation.mutate({
      slotSeries: series,
      availabilityFrom: first?.from,
      availabilityTo: first?.to,
      availableDays: first?.days,
    });
  };

  // Calendar helpers
  const calendarDaysArray = (): (number | null)[] => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    return cells;
  };

  const toDateStr = (day: number): string => {
    const y = calendarMonth.getFullYear();
    const m = String(calendarMonth.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-${String(day).padStart(2, "0")}`;
  };

  const getOverrideForDate = (dateStr: string) => slotOverrides.find(o => o.date === dateStr);

  const handleDayPointerDown = (day: number) => {
    const dateStr = toDateStr(day);
    const timer = setTimeout(() => {
      const existing = getOverrideForDate(dateStr);
      if (existing?.isPaused) {
        deleteOverrideMutation.mutate({ date: dateStr });
        toast({ title: "Day Resumed", description: `${dateStr} restored to default hours` });
      } else {
        upsertOverrideMutation.mutate({ date: dateStr, isPaused: true });
        toast({ title: "Day Paused", description: `No consultations on ${dateStr}` });
      }
    }, 600);
    setLongPressTimer(timer);
  };

  const handleDayPointerUp = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); setLongPressTimer(null); }
  };

  const handleDayClick = (day: number) => {
    const dateStr = toDateStr(day);
    const existing = getOverrideForDate(dateStr);
    setDayActionDate(dateStr);
    setDayActionCustomFrom(existing?.customFrom || series[0]?.from || "09:00 AM");
    setDayActionCustomTo(existing?.customTo || series[0]?.to || "05:00 PM");
  };

  const handleSaveDayCustomTime = () => {
    if (!dayActionDate) return;
    upsertOverrideMutation.mutate({ date: dayActionDate, isPaused: false, customFrom: dayActionCustomFrom, customTo: dayActionCustomTo });
    toast({ title: "Custom Hours Saved", description: `${dayActionDate}: ${dayActionCustomFrom} – ${dayActionCustomTo}` });
    setDayActionDate(null);
  };

  const handleRemoveDayOverride = () => {
    if (!dayActionDate) return;
    deleteOverrideMutation.mutate({ date: dayActionDate });
    toast({ title: "Override Removed", description: `${dayActionDate} reverted to default hours` });
    setDayActionDate(null);
  };

  const prevMonth = () => setCalendarMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d; });
  const nextMonth = () => setCalendarMonth(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d; });

  // ── Collapsed summary view ──
  if (!open) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <div className="flex items-start gap-2 min-w-0">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
          <div className="min-w-0 space-y-0.5">
            {series.length === 0 ? (
              <p className="text-sm text-muted-foreground">No schedule configured</p>
            ) : series.length === 1 ? (
              <>
                <p className="text-sm font-medium truncate">{DAYS_OF_WEEK.filter(d => series[0].days.includes(d)).join(" · ")}</p>
                <p className="text-xs text-muted-foreground">{series[0].from} – {series[0].to}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{series.length} time windows</p>
                {series.map((s, i) => (
                  <p key={i} className="text-xs text-muted-foreground">{seriesSummary(s)}</p>
                ))}
              </>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setOpen(true)}
          data-testid="button-edit-slots"
        >
          Edit Slots
        </Button>
      </div>
    );
  }

  // ── Expanded editor ──
  return (
    <div className="rounded-lg border bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <p className="text-sm font-semibold">Edit Slots{consultantName ? ` — ${consultantName}` : ""}</p>
        <button
          type="button"
          onClick={() => { setOpen(false); setDayActionDate(null); }}
          className="text-muted-foreground hover:text-foreground transition-colors"
          data-testid="button-close-slot-editor"
          aria-label="Close slot editor"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-4">
        <Tabs defaultValue="schedule" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="schedule" className="flex-1" data-testid="tab-default-schedule">Default Schedule</TabsTrigger>
            <TabsTrigger value="calendar" className="flex-1" data-testid="tab-calendar">Calendar</TabsTrigger>
          </TabsList>

          {/* ── Default Schedule tab ── */}
          <TabsContent value="schedule" className="space-y-4 pt-3">

            {/* Saved series list */}
            {series.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Saved windows</p>
                <div className="space-y-2">
                  {series.map((s, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2"
                      data-testid={`series-item-${idx}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {DAYS_OF_WEEK.filter(d => s.days.includes(d)).join(" · ")}
                          </p>
                          <p className="text-xs text-muted-foreground">{s.from} – {s.to}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSeries(idx)}
                        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                        data-testid={`button-remove-series-${idx}`}
                        aria-label="Remove this window"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Draft builder */}
            <div className="space-y-4 rounded-md border border-dashed p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {series.length === 0 ? "Set availability window" : "Add another window"}
              </p>

              {/* Day picker */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Days</p>
                <div className="flex flex-wrap gap-2">
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleDraftDay(day)}
                      data-testid={`btn-day-${day}`}
                      className={`h-9 w-12 rounded-md border text-sm font-medium transition-colors select-none
                        ${draftDays.includes(day)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-muted-foreground border-border hover:bg-muted"
                        }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time picker */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Time Window</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">From</label>
                    <Select value={draftFrom} onValueChange={setDraftFrom}>
                      <SelectTrigger data-testid="select-availability-from"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">To</label>
                    <Select value={draftTo} onValueChange={setDraftTo}>
                      <SelectTrigger data-testid="select-availability-to"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Lock in button */}
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={lockInDraft}
                disabled={draftDays.length === 0}
                data-testid="button-lock-in-series"
              >
                <Plus className="mr-2 h-4 w-4" />
                {series.length === 0 ? "Add Window" : "Add Another Window"}
              </Button>
            </div>

            {/* Save */}
            <Button
              className="w-full"
              onClick={handleSaveSchedule}
              disabled={updateSlotsMutation.isPending || series.length === 0}
              data-testid="button-save-schedule"
            >
              {updateSlotsMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Schedule
            </Button>
          </TabsContent>

          {/* ── Calendar tab ── */}
          <TabsContent value="calendar" className="space-y-3 pt-3">
            {/* Instructions */}
            <div className="flex items-start gap-2 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong>Tap</strong> a date to set custom hours for that day.{" "}
                <strong>Long-press</strong> (hold) to mark it as paused (unavailable) or to undo a pause.
              </span>
            </div>

            {/* Month nav */}
            <div className="flex items-center justify-between">
              <Button size="sm" variant="ghost" onClick={prevMonth} data-testid="btn-prev-month">‹</Button>
              <span className="text-sm font-medium">
                {calendarMonth.toLocaleString("default", { month: "long", year: "numeric" })}
              </span>
              <Button size="sm" variant="ghost" onClick={nextMonth} data-testid="btn-next-month">›</Button>
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(h => (
                <div key={h} className="text-xs font-medium text-muted-foreground py-1">{h}</div>
              ))}
              {calendarDaysArray().map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} />;
                const dateStr = toDateStr(day);
                const override = getOverrideForDate(dateStr);
                const isPaused = override?.isPaused === true;
                const hasCustom = override && !override.isPaused;
                const isToday = dateStr === new Date().toISOString().slice(0, 10);
                return (
                  <button
                    key={dateStr}
                    type="button"
                    data-testid={`cal-day-${dateStr}`}
                    onPointerDown={() => handleDayPointerDown(day)}
                    onPointerUp={handleDayPointerUp}
                    onPointerLeave={handleDayPointerUp}
                    onClick={() => handleDayClick(day)}
                    className={`relative h-9 w-full rounded-md text-sm font-medium transition-colors select-none touch-none
                      ${isPaused
                        ? "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700"
                        : hasCustom
                        ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700"
                        : isToday
                        ? "border-2 border-primary text-primary"
                        : "hover:bg-muted border border-transparent"}`}
                  >
                    {day}
                    {isPaused && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] leading-none">off</span>}
                    {hasCustom && <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] leading-none">custom</span>}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-red-100 dark:bg-red-950 border border-red-300 dark:border-red-700" />Paused
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-700" />Custom hours
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-3 w-3 rounded border-2 border-primary" />Today
              </span>
            </div>

            {/* Day action sub-panel */}
            {dayActionDate && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{dayActionDate}</p>
                  <button type="button" onClick={() => setDayActionDate(null)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">From</label>
                    <Select value={dayActionCustomFrom} onValueChange={setDayActionCustomFrom}>
                      <SelectTrigger data-testid="select-day-from"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">To</label>
                    <Select value={dayActionCustomTo} onValueChange={setDayActionCustomTo}>
                      <SelectTrigger data-testid="select-day-to"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" onClick={handleSaveDayCustomTime} disabled={upsertOverrideMutation.isPending} data-testid="button-save-day-custom">
                    {upsertOverrideMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                    Save Hours
                  </Button>
                  {getOverrideForDate(dayActionDate) && (
                    <Button size="sm" variant="outline" className="flex-1 text-destructive border-destructive hover:bg-destructive/10" onClick={handleRemoveDayOverride} disabled={deleteOverrideMutation.isPending} data-testid="button-remove-day-override">
                      Remove Override
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
