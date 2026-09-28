import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const DAYS = [
  { name: "Monday", short: "Mon" },
  { name: "Tuesday", short: "Tue" },
  { name: "Wednesday", short: "Wed" },
  { name: "Thursday", short: "Thu" },
  { name: "Friday", short: "Fri" },
  { name: "Saturday", short: "Sat" },
  { name: "Sunday", short: "Sun" },
] as const;

type TimeWindow = {
  id: string;
  from: number;
  to: number;
  paused: boolean;
};

type DayAvailability = {
  enabled: boolean;
  windows: TimeWindow[];
};

type WeeklyAvailability = DayAvailability[];

type ProviderConsultant = {
  id: string;
  name?: string;
  displayName?: string;
  status?: string;
  availabilityFrom?: string | null;
  availabilityTo?: string | null;
  availableDays?: string[] | null;
  availableSlots?: string[] | null;
  slotSeries?: { days: string[]; from: string; to: string; paused?: boolean; disabled?: boolean }[] | null;
};

type TimePickerTarget =
  | { kind: "new"; dayIndex: number }
  | { kind: "edit"; dayIndex: number; windowId: string; field: "from" | "to" };

const emptyWeek = (): WeeklyAvailability =>
  DAYS.map(() => ({ enabled: false, windows: [] }));

function normalizeDay(value: string): number {
  const canonical = value.trim().toLowerCase();
  return DAYS.findIndex(
    (day) => day.name.toLowerCase() === canonical || day.short.toLowerCase() === canonical,
  );
}

function parseMinutes(value?: string | null): number | null {
  if (!value) return null;
  const time = value.trim();
  const meridiemMatch = time.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1]);
    const minute = Number(meridiemMatch[2] ?? "0");
    if (hour < 1 || hour > 12 || minute > 59 || minute % 30 !== 0) return null;
    const suffix = meridiemMatch[3].toUpperCase();
    if (suffix === "PM" && hour !== 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
    return hour * 60 + minute;
  }
  const twentyFourHour = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) return null;
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  if (hour === 24 && minute === 0) return 1440;
  if (hour > 23 || minute > 59 || minute % 30 !== 0) return null;
  return hour * 60 + minute;
}

function formatTime(minutes: number): string {
  if (minutes === 1440) return "12:00 AM";
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${String(displayHour).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function makeWindowId(dayIndex: number, index: number): string {
  return `${DAYS[dayIndex].short}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readConsultantAvailability(consultant: ProviderConsultant): WeeklyAvailability {
  const week = emptyWeek();
  let nextWindowIndex = 0;
  const addWindow = (dayIndex: number, fromValue: string, toValue: string, paused = false) => {
    const from = parseMinutes(fromValue);
    let to = parseMinutes(toValue);
    // Midnight is a valid end-of-day value, not an overnight start.
    if (to === 0 && from !== null && from > 0) to = 1440;
    if (from === null || to === null || from >= to || to > 1440) return;
    week[dayIndex].windows.push({
      id: makeWindowId(dayIndex, nextWindowIndex++),
      from,
      to,
      paused,
    });
  };

  if (consultant.slotSeries?.length) {
    consultant.slotSeries.forEach((series) => {
      (series.days ?? []).forEach((dayName) => {
        const dayIndex = normalizeDay(dayName);
        if (dayIndex >= 0) addWindow(dayIndex, series.from, series.to, series.paused);
      });
    });
  } else if (consultant.availableSlots?.length) {
    consultant.availableSlots.forEach((slot) => {
      const match = slot.match(
        /^\s*(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*,?\s+(.+?)\s*$/i,
      );
      if (!match) return;
      const dayIndex = normalizeDay(match[1]);
      const times = match[2].match(/\d{1,2}(?::\d{2})?\s*(?:AM|PM)/gi) ?? [];
      if (dayIndex >= 0 && times[0] && times[1]) addWindow(dayIndex, times[0], times[1]);
    });
  } else if (consultant.availabilityFrom && consultant.availabilityTo) {
    (consultant.availableDays ?? []).forEach((dayName) => {
      const dayIndex = normalizeDay(dayName);
      if (dayIndex >= 0) {
        addWindow(dayIndex, consultant.availabilityFrom!, consultant.availabilityTo!);
      }
    });
  }

  const daysExplicitlySet = Array.isArray(consultant.availableDays);
  week.forEach((day, index) => {
    const availableDay = consultant.availableDays?.some((name) => normalizeDay(name) === index);
    day.enabled = daysExplicitlySet ? Boolean(availableDay) : day.windows.length > 0;
    day.windows.sort((a, b) => a.from - b.from);
  });
  return week;
}

function serializeWeek(week: WeeklyAvailability) {
  const slotSeries = week.flatMap((day, index) =>
    day.windows.map((window) => ({
      days: [DAYS[index].short],
      from: formatTime(window.from),
      to: formatTime(window.to),
      ...(window.paused ? { paused: true } : {}),
      ...(!day.enabled ? { disabled: true } : {}),
    })),
  );
  return {
    slotSeries,
    availableSlots: [],
    availableDays: week
      .map((day, index) => (day.enabled ? DAYS[index].short : null))
      .filter((day): day is Exclude<typeof day, null> => day !== null),
    availabilityFrom: "",
    availabilityTo: "",
  };
}

function getApiError(data: any, fallback: string): string {
  return typeof data?.message === "string" && data.message.trim()
    ? data.message
    : fallback;
}

export default function AvailabilityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const lockRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [week, setWeek] = useState<WeeklyAvailability>(emptyWeek);
  const [weekLoadedFor, setWeekLoadedFor] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({ 0: true });
  const [timePicker, setTimePicker] = useState<TimePickerTarget | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const consultantsQuery = useQuery<ProviderConsultant[]>({
    queryKey: ["mobile-provider-consultants", user?.id],
    enabled: user?.role === "provider",
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await apiFetch("/api/provider/my-consultants");
      if (!response.ok) throw new Error("Unable to load provider availability.");
      return response.json();
    },
  });
  useFocusEffect(
    useCallback(() => {
      if (user?.role === "provider") void consultantsQuery.refetch();
    }, [consultantsQuery.refetch, user?.role]),
  );

  const consultants = consultantsQuery.data ?? [];
  const selectedConsultant = consultants.find((consultant) => consultant.id === selectedId)
    ?? consultants[0];
  const selectedConsultantId = selectedConsultant?.id ?? null;
  const status = selectedConsultant
    ? statusOverrides[selectedConsultant.id] ?? selectedConsultant.status ?? "paused"
    : "paused";
  const isAvailable = status === "active";
  const dayOptions = useMemo(
    () => Array.from({ length: 48 }, (_, index) => index * 30),
    [],
  );

  React.useEffect(() => {
    if (!selectedConsultant || weekLoadedFor === selectedConsultant.id) return;
    setWeek(readConsultantAvailability(selectedConsultant));
    setWeekLoadedFor(selectedConsultant.id);
    setError(null);
    setExpandedDays({ 0: true });
  }, [selectedConsultant, weekLoadedFor]);

  const beginRequest = () => {
    if (lockRef.current) return false;
    lockRef.current = true;
    setPending(true);
    setError(null);
    return true;
  };

  const finishRequest = () => {
    lockRef.current = false;
    setPending(false);
  };

  const saveWeek = async (nextWeek: WeeklyAvailability) => {
    if (!selectedConsultant || !beginRequest()) return;
    const previousWeek = week;
    setWeek(nextWeek);
    try {
      const response = await apiFetch(`/api/consultants/${selectedConsultant.id}/slots`, {
        method: "PATCH",
        body: JSON.stringify(serializeWeek(nextWeek)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(data, "Unable to save availability."));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile-provider-consultants", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-consultants"] }),
      ]);
    } catch (saveError) {
      setWeek(previousWeek);
      setError(saveError instanceof Error ? saveError.message : "Unable to save availability.");
    } finally {
      finishRequest();
    }
  };

  const toggleConsultantStatus = async () => {
    if (!selectedConsultant || !beginRequest()) return;
    const previousStatus = status;
    const nextStatus = isAvailable ? "paused" : "active";
    setStatusOverrides((current) => ({ ...current, [selectedConsultant.id]: nextStatus }));
    try {
      const response = await apiFetch(`/api/provider/consultants/${selectedConsultant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(getApiError(data, "Unable to update availability."));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile-provider-consultants", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-consultants"] }),
      ]);
    } catch (statusError) {
      setStatusOverrides((current) => ({ ...current, [selectedConsultant.id]: previousStatus }));
      setError(statusError instanceof Error ? statusError.message : "Unable to update availability.");
    } finally {
      finishRequest();
    }
  };

  const updateDay = (dayIndex: number, change: (day: DayAvailability) => DayAvailability) => {
    if (pending || !selectedConsultant) return;
    const nextWeek = week.map((day, index) => index === dayIndex ? change(day) : day);
    void saveWeek(nextWeek);
  };

  const toggleDay = (dayIndex: number) => {
    const isTurningOff = week[dayIndex].enabled;
    updateDay(dayIndex, (day) => ({ ...day, enabled: !day.enabled }));
    setExpandedDays((current) => ({ ...current, [dayIndex]: !isTurningOff }));
  };

  const toggleExpanded = (dayIndex: number) => {
    setExpandedDays((current) => ({ ...current, [dayIndex]: !current[dayIndex] }));
  };

  const deleteWindow = (dayIndex: number, windowId: string) => {
    updateDay(dayIndex, (day) => ({
      ...day,
      windows: day.windows.filter((window) => window.id !== windowId),
    }));
  };

  const toggleWindowPaused = (dayIndex: number, windowId: string) => {
    updateDay(dayIndex, (day) => ({
      ...day,
      windows: day.windows.map((window) =>
        window.id === windowId ? { ...window, paused: !window.paused } : window,
      ),
    }));
  };

  const copyToAllDays = (sourceIndex: number) => {
    if (pending) return;
    const source = week[sourceIndex];
    const nextWeek = week.map((day, index) =>
      index === sourceIndex
        ? { ...day, enabled: true }
        : {
            enabled: true,
            windows: source.windows.map((window, windowIndex) => ({
              ...window,
              id: makeWindowId(index, windowIndex),
            })),
          },
    );
    setExpandedDays((current) => ({ ...current, [sourceIndex]: true }));
    void saveWeek(nextWeek);
  };

  const openNewWindowPicker = (dayIndex: number) => {
    if (!pending) setTimePicker({ kind: "new", dayIndex });
  };

  const chooseTime = (minutes: number) => {
    if (!timePicker || pending) return;
    if (timePicker.kind === "new") {
      const { dayIndex } = timePicker;
      const nextWeek = week.map((day, index) => {
        if (index !== dayIndex) return day;
        const end = Math.min(minutes + 30, 1440);
        return {
          enabled: true,
          windows: [
            ...day.windows,
            { id: makeWindowId(dayIndex, day.windows.length), from: minutes, to: end, paused: false },
          ].sort((a, b) => a.from - b.from),
        };
      });
      setExpandedDays((current) => ({ ...current, [dayIndex]: true }));
      setTimePicker(null);
      void saveWeek(nextWeek);
      return;
    }

    const { dayIndex, windowId, field } = timePicker;
    const day = week[dayIndex];
    const target = day.windows.find((window) => window.id === windowId);
    if (!target) {
      setTimePicker(null);
      return;
    }
    const normalizedValue = field === "to" && minutes === 0 ? 1440 : minutes;
    if (
      (field === "from" && normalizedValue >= target.to)
      || (field === "to" && normalizedValue <= target.from)
    ) {
      setError("The end time must be later than the start time.");
      return;
    }
    const nextWeek = week.map((currentDay, index) =>
      index !== dayIndex
        ? currentDay
        : {
            ...currentDay,
            windows: currentDay.windows.map((window) =>
              window.id === windowId ? { ...window, [field]: normalizedValue } : window,
            ).sort((a, b) => a.from - b.from),
          },
    );
    setTimePicker(null);
    void saveWeek(nextWeek);
  };

  const getPickerOptions = () => {
    if (!timePicker) return [];
    if (timePicker.kind === "new") return dayOptions;
    const target = week[timePicker.dayIndex]?.windows.find(
      (window) => window.id === timePicker.windowId,
    );
    if (!target) return [];
    if (timePicker.field === "from") {
      return dayOptions.filter((minutes) => minutes < target.to);
    }
    return [
      ...dayOptions.filter((minutes) => minutes > target.from),
      ...(target.from > 0 ? [1440] : []),
    ];
  };

  const pickerOptions = getPickerOptions();
  const webTopInset = Platform.OS === "web" ? 67 : 0;
  const webBottomInset = Platform.OS === "web" ? 34 : 0;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, {
        backgroundColor: colors.card,
        borderBottomColor: colors.border,
        paddingTop: insets.top + webTopInset + 8,
      }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={21} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Availability</Text>
        <View style={styles.headerSpacer} />
      </View>

      {consultantsQuery.isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>Loading availability…</Text>
        </View>
      ) : consultantsQuery.isError ? (
        <View style={styles.centeredState}>
          <Ionicons name="alert-circle-outline" size={30} color={colors.destructive} />
          <Text style={[styles.stateText, { color: colors.destructive }]}>
            {consultantsQuery.error instanceof Error
              ? consultantsQuery.error.message
              : "Unable to load provider availability."}
          </Text>
          <Pressable onPress={() => consultantsQuery.refetch()} accessibilityRole="button">
            <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
          </Pressable>
        </View>
      ) : !selectedConsultant ? (
        <View style={styles.centeredState}>
          <Ionicons name="calendar-outline" size={30} color={colors.mutedForeground} />
          <Text style={[styles.stateText, { color: colors.mutedForeground }]}>
            No consultant profile is connected to this provider account yet.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + webBottomInset + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {consultants.length > 1 && (
              <Pressable
                onPress={() => !pending && setSwitcherOpen(true)}
                disabled={pending}
                accessibilityRole="button"
                accessibilityLabel="Choose consultant profile"
                style={[styles.consultantSelector, {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  opacity: pending ? 0.65 : 1,
                }]}
              >
                <View style={styles.selectorText}>
                  <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>CONSULTANT PROFILE</Text>
                  <Text style={[styles.consultantName, { color: colors.foreground }]} numberOfLines={1}>
                    {selectedConsultant.displayName || selectedConsultant.name || "Consultant"}
                  </Text>
                </View>
                <Feather name="chevron-down" size={20} color={colors.mutedForeground} />
              </Pressable>
            )}

            <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.statusLine}>
                <View style={[styles.statusDot, { backgroundColor: isAvailable ? colors.success : colors.terminal }]} />
                <Text style={[styles.statusText, { color: colors.foreground }]}>
                  {isAvailable ? "Available" : "Paused"}
                </Text>
                {pending && <ActivityIndicator size="small" color={colors.primary} />}
                <Pressable
                  onPress={toggleConsultantStatus}
                  disabled={pending}
                  accessibilityRole="button"
                  accessibilityLabel={isAvailable ? "Pause consultations" : "Resume consultations"}
                  style={({ pressed }) => [
                    styles.statusButton,
                    { backgroundColor: isAvailable ? colors.foreground : colors.success, opacity: pressed || pending ? 0.7 : 1 },
                  ]}
                >
                  <Text style={[styles.statusButtonText, { color: colors.primaryForeground }]}>
                    {isAvailable ? "Pause" : "Resume"}
                  </Text>
                </Pressable>
              </View>
            </View>

            {error && (
              <View style={[styles.errorBox, { backgroundColor: `${colors.destructive}10` }]}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.destructive} />
                <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>
              </View>
            )}

            <View style={styles.istLine}>
              <Feather name="clock" size={14} color={colors.mutedForeground} />
              <Text style={[styles.istText, { color: colors.mutedForeground }]}>
                All times shown in IST · each consultation slot is 30 minutes
              </Text>
            </View>

            <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>WEEKLY AVAILABILITY</Text>

            {DAYS.map((day, dayIndex) => {
              const dayConfig = week[dayIndex];
              const isExpanded = Boolean(expandedDays[dayIndex]);
              const summary = !dayConfig.enabled
                ? "Unavailable"
                : dayConfig.windows.length
                  ? `${dayConfig.windows.length} ${dayConfig.windows.length === 1 ? "slot" : "slots"}`
                  : "No time windows yet";
              return (
                <View
                  key={day.short}
                  style={[styles.dayCard, {
                    backgroundColor: colors.card,
                    borderBottomColor: colors.border,
                  }]}
                >
                  <View style={styles.dayHeader}>
                    <Pressable
                      onPress={() => toggleExpanded(dayIndex)}
                      style={styles.dayHeadingTap}
                      disabled={pending}
                      accessibilityRole="button"
                      accessibilityLabel={`${day.name}, ${summary}. ${isExpanded ? "Collapse" : "Expand"} day details`}
                    >
                      <View style={styles.dayNameWrap}>
                        <Text style={[styles.dayName, { color: colors.foreground }]}>{day.name}</Text>
                        <Text style={[styles.daySummary, { color: colors.mutedForeground }]}>{summary}</Text>
                      </View>
                      <Feather
                        name={isExpanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={colors.mutedForeground}
                      />
                    </Pressable>
                    <Switch
                      value={dayConfig.enabled}
                      disabled={pending}
                      onValueChange={() => toggleDay(dayIndex)}
                      trackColor={{ false: colors.border, true: `${colors.success}99` }}
                      thumbColor={dayConfig.enabled ? colors.success : colors.mutedForeground}
                      accessibilityRole="switch"
                      accessibilityLabel={`${day.name} availability`}
                      accessibilityState={{ checked: dayConfig.enabled, disabled: pending }}
                    />
                  </View>
                  {isExpanded && dayConfig.enabled && (
                    <View style={styles.dayBody}>
                      {dayConfig.windows.map((window) => (
                        <Pressable
                          key={window.id}
                          onLongPress={() => toggleWindowPaused(dayIndex, window.id)}
                          delayLongPress={500}
                          disabled={pending}
                          accessibilityRole="button"
                          accessibilityLabel={`${formatTime(window.from)} to ${formatTime(window.to)}, long press to ${window.paused ? "resume" : "pause"}`}
                          style={styles.windowRow}
                        >
                          <Pressable
                            onPress={() => {
                              if (!pending) setTimePicker({
                                kind: "edit",
                                dayIndex,
                                windowId: window.id,
                                field: "from",
                              });
                            }}
                            disabled={pending}
                            accessibilityRole="button"
                            accessibilityLabel="Change start time"
                            style={[
                              styles.timeButton,
                              {
                                backgroundColor: window.paused ? colors.accent : colors.background,
                                borderColor: colors.border,
                              },
                            ]}
                          >
                            <Text style={[
                              styles.timeText,
                              { color: window.paused ? colors.mutedForeground : colors.foreground },
                              window.paused && styles.pausedText,
                            ]}>
                              {formatTime(window.from)}
                            </Text>
                          </Pressable>
                          <Text style={[styles.timeSeparator, { color: colors.mutedForeground }]}>–</Text>
                          <Pressable
                            onPress={() => {
                              if (!pending) setTimePicker({
                                kind: "edit",
                                dayIndex,
                                windowId: window.id,
                                field: "to",
                              });
                            }}
                            disabled={pending}
                            accessibilityRole="button"
                            accessibilityLabel="Change end time"
                            style={[
                              styles.timeButton,
                              {
                                backgroundColor: window.paused ? colors.accent : colors.background,
                                borderColor: colors.border,
                              },
                            ]}
                          >
                            <Text style={[
                              styles.timeText,
                              { color: window.paused ? colors.mutedForeground : colors.foreground },
                              window.paused && styles.pausedText,
                            ]}>
                              {formatTime(window.to)}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() => deleteWindow(dayIndex, window.id)}
                            disabled={pending}
                            accessibilityRole="button"
                            accessibilityLabel="Delete time window"
                            hitSlop={8}
                            style={styles.deleteButton}
                          >
                            <Feather name="x" size={17} color={colors.mutedForeground} />
                          </Pressable>
                        </Pressable>
                      ))}
                      <Pressable
                        onPress={() => openNewWindowPicker(dayIndex)}
                        disabled={pending}
                        accessibilityRole="button"
                        style={styles.actionLine}
                      >
                        <Feather name="plus" size={16} color={colors.primary} />
                        <Text style={[styles.actionText, { color: colors.primary }]}>Add time window</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => copyToAllDays(dayIndex)}
                        disabled={pending}
                        accessibilityRole="button"
                        style={styles.actionLine}
                      >
                        <Feather name="copy" size={14} color={colors.blue} />
                        <Text style={[styles.actionText, { color: colors.blue }]}>Copy to all days</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              );
            })}

            <View style={styles.footerNote}>
              <Feather name="info" size={15} color={colors.mutedForeground} />
              <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
                Changes to availability never alter consultations already scheduled.
              </Text>
            </View>
          </ScrollView>
        </>
      )}

      <Modal
        visible={Boolean(timePicker)}
        transparent
        animationType="slide"
        onRequestClose={() => setTimePicker(null)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setTimePicker(null)} />
          <View style={[styles.pickerSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 12 }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.pickerHeader}>
              <View>
                <Text style={[styles.pickerTitle, { color: colors.foreground }]}>
                  {timePicker?.kind === "new"
                    ? "Choose a start time"
                    : timePicker?.field === "from"
                      ? "Start time"
                      : "End time"}
                </Text>
                <Text style={[styles.pickerSubtitle, { color: colors.mutedForeground }]}>
                  30-minute increments · IST
                </Text>
              </View>
              <Pressable onPress={() => setTimePicker(null)} hitSlop={10} accessibilityLabel="Close time picker">
                <Feather name="x" size={21} color={colors.mutedForeground} />
              </Pressable>
            </View>
            <ScrollView style={styles.timeOptions} showsVerticalScrollIndicator={false}>
              {pickerOptions.map((minutes) => (
                <Pressable
                  key={minutes}
                  onPress={() => chooseTime(minutes)}
                  disabled={pending}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.timeOption,
                    { borderBottomColor: colors.border, opacity: pressed ? 0.65 : 1 },
                  ]}
                >
                  <Text style={[styles.timeOptionText, { color: colors.foreground }]}>{formatTime(minutes)}</Text>
                  <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={switcherOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSwitcherOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSwitcherOpen(false)} />
          <View style={[styles.switcherSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Choose consultant</Text>
              <Pressable onPress={() => setSwitcherOpen(false)} hitSlop={10} accessibilityLabel="Close consultant list">
                <Feather name="x" size={21} color={colors.mutedForeground} />
              </Pressable>
            </View>
            {consultants.map((consultant) => (
              <Pressable
                key={consultant.id}
                onPress={() => {
                  setSelectedId(consultant.id);
                  setWeekLoadedFor(null);
                  setSwitcherOpen(false);
                }}
                accessibilityRole="button"
                style={[styles.consultantOption, { borderTopColor: colors.border }]}
              >
                <View style={styles.selectorText}>
                  <Text style={[styles.consultantName, { color: colors.foreground }]}>
                    {consultant.displayName || consultant.name || "Consultant"}
                  </Text>
                  <Text style={[styles.optionStatus, { color: consultant.status === "active" ? colors.success : colors.mutedForeground }]}>
                    {consultant.status === "active" ? "Available" : consultant.status === "paused" ? "Paused" : "Status unavailable"}
                  </Text>
                </View>
                {consultant.id === selectedConsultantId && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  backButton: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Sora_600SemiBold", fontSize: 17, flex: 1 },
  headerSpacer: { width: 30 },
  scroll: { flex: 1 },
  content: { paddingTop: 16 },
  centeredState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, gap: 12 },
  stateText: { fontFamily: "Inter_500Medium", fontSize: 14, textAlign: "center", lineHeight: 21 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, padding: 8 },
  consultantSelector: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectorText: { flex: 1, gap: 3 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 0.8 },
  consultantName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  statusCard: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
  },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 9 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusText: { fontFamily: "Inter_700Bold", fontSize: 14, flex: 1 },
  statusButton: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 9 },
  statusButtonText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  istLine: { flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 17, marginBottom: 18 },
  istText: { fontFamily: "Inter_400Regular", fontSize: 11.5, flexShrink: 1 },
  sectionLabel: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.7, paddingHorizontal: 16, paddingBottom: 8 },
  dayCard: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12 },
  dayHeader: { flexDirection: "row", alignItems: "center", minHeight: 40, gap: 8 },
  dayHeadingTap: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  dayNameWrap: { flex: 1, gap: 3 },
  dayName: { fontFamily: "Inter_700Bold", fontSize: 14 },
  daySummary: { fontFamily: "Inter_400Regular", fontSize: 11.5 },
  dayBody: { paddingLeft: 2, paddingTop: 11, paddingBottom: 2 },
  windowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  timeButton: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 9,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  timeText: { fontFamily: "Inter_600SemiBold", fontSize: 12.5 },
  pausedText: { textDecorationLine: "line-through" },
  timeSeparator: { fontFamily: "Inter_500Medium", fontSize: 12 },
  deleteButton: { width: 30, height: 34, alignItems: "center", justifyContent: "center" },
  actionLine: { minHeight: 34, flexDirection: "row", alignItems: "center", gap: 7 },
  actionText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  footerNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 17, marginTop: 18, marginBottom: 14 },
  footerText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11.5, lineHeight: 17 },
  errorBox: { marginHorizontal: 16, marginBottom: 12, borderRadius: 9, padding: 10, flexDirection: "row", alignItems: "flex-start", gap: 7 },
  errorText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 17 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(20,20,25,0.42)" },
  pickerSheet: { maxHeight: "78%", borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingTop: 10 },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 15 },
  pickerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 14 },
  pickerTitle: { fontFamily: "Sora_600SemiBold", fontSize: 16 },
  pickerSubtitle: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 4 },
  timeOptions: { flexGrow: 0 },
  timeOption: { minHeight: 48, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  timeOptionText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  switcherSheet: { marginHorizontal: 20, marginBottom: 36, borderWidth: 1, borderRadius: 16, padding: 16 },
  consultantOption: { borderTopWidth: StyleSheet.hairlineWidth, minHeight: 58, flexDirection: "row", alignItems: "center", paddingTop: 9, marginTop: 8, gap: 10 },
  optionStatus: { fontFamily: "Inter_400Regular", fontSize: 11.5 },
});