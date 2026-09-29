import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/contexts/AuthContext";
import {
  Booking,
  formatTime,
  isSeekerRole,
  isTerminalStatus,
  statusPresentation,
} from "@/lib/mobile-models";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/hooks/useApi";
import { designTokens } from "@/constants/designTokens";

export type { Booking };

type Props = {
  booking: Booking;
  onStatusToggle?: (booking: Booking) => void;
  statusTogglePending?: boolean;
};

export function BookingCard({ booking, onStatusToggle, statusTogglePending = false }: Props) {
  const palette = useColors();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [startingCall, setStartingCall] = useState<"voice" | "video" | null>(null);
  const seeker = isSeekerRole(user?.role);
  const provider = user?.role === "provider";
  const providerConsultation = provider && booking.bookingType === "consultation";
  const status = booking.bookingType === "consultation" && booking.consultationLifecycleAvailable === false
    ? { label: "Schedule unavailable", dot: palette.warning, text: palette.warning }
    : statusPresentation(booking.status, {
        success: palette.success,
        terminal: palette.terminal,
        warning: palette.warning,
        quiet: palette.quiet,
        blue: palette.blue,
      });
  const terminal = isTerminalStatus(booking.status);
  const paused = booking.status.toLowerCase() === "paused";
  const canToggleStatus =
    provider &&
    !!onStatusToggle &&
    booking.bookingType === "consultation" &&
    booking.consultationLifecycleAvailable !== false &&
    ["ongoing", "paused"].includes(booking.status.toLowerCase());
  const person = seeker ? booking.providerName : booking.patientName;
  const initials = (person || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "—";
  const service = booking.providerSpecialization || booking.serviceName || "Consultation";
  const hospital = seeker ? booking.providerHospital : booking.seekerHospitalName || booking.hospitalName;
  const location = seeker
    ? booking.providerCity || booking.city
    : providerConsultation
      ? booking.seekerCity || booking.city
      : booking.seekerHospitalLocation || booking.city;
  const title = providerConsultation ? hospital || "Consultation" : service;
  const patientContext = seeker ? booking.patientName : null;
  const time = formatTime(booking.appointmentSlot || booking.timeSlot || booking.scheduledDate);
  const callsAvailable =
    !terminal &&
    booking.bookingType === "consultation" &&
    booking.consultationLifecycleAvailable !== false &&
    booking.status.toLowerCase() === "ongoing";
  const videoAvailable = callsAvailable;
  const statusTint = status.text === palette.success
    ? designTokens.color.greenTint
    : status.text === palette.warning
      ? designTokens.color.goldTint
      : status.text === palette.blue
        ? designTokens.color.blueTint
        : status.text === palette.quiet
          ? designTokens.color.plumTint
          : palette.muted;

  const toggleExpanded = () => {
    if (Platform.OS === "android") UIManager.setLayoutAnimationEnabledExperimental?.(true);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((value) => !value);
  };

  const startCall = async (callType: "voice" | "video") => {
    if (startingCall) return;
    setStartingCall(callType);
    try {
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const res = await apiFetch(`/api/call/ring/${booking.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.reason || "Cannot start call");
      }
      const result: { session?: { sessionGeneration?: string } } = await res.json();
      router.push(`/call/${booking.id}?mode=${callType}&generation=${result.session?.sessionGeneration || ""}`);
    } catch (error) {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(
        "Cannot start call",
        error instanceof Error ? error.message : "The call window may not be open yet."
      );
    } finally {
      setStartingCall(null);
    }
  };

  return (
    <View style={[styles.row, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={styles.rowMain}>
        <View style={[styles.badge, { backgroundColor: seeker ? designTokens.color.coralTint : designTokens.color.plumTint }]}>
          <Text style={[styles.badgeText, { color: seeker ? palette.primary : palette.quiet }]}>{initials}</Text>
        </View>
        <View style={styles.rowBody}>
          <Pressable
            style={styles.rowDetails}
            onPress={toggleExpanded}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            testID={`consultation-row-${booking.id}`}
          >
            <Text style={[styles.person, { color: palette.foreground }]}>{person || (seeker ? "Consultant" : "Patient")}</Text>
            <Text style={[styles.title, { color: palette.mutedForeground }]}>{title}</Text>
            {patientContext ? <Text style={[styles.patientContext, { color: palette.mutedForeground }]}>For patient: {patientContext}</Text> : null}
            {providerConsultation ? (
              location ? (
                <Text style={[styles.place, { color: palette.mutedForeground }]}>· {location}</Text>
              ) : null
            ) : (hospital || location) ? (
              <View style={styles.placeLine}>
                {hospital ? <Text style={[styles.placeStrong, { color: palette.foreground }]}>{hospital}</Text> : null}
                {location ? <Text style={[styles.place, { color: palette.mutedForeground }]}>{hospital ? ` · ${location}` : location}</Text> : null}
              </View>
            ) : null}
          </Pressable>
          <View style={styles.scheduleLine}>
            <Feather name="calendar" size={13} color={palette.mutedForeground} />
            <Text style={[styles.time, { color: palette.mutedForeground }]}>{time}</Text>
            {canToggleStatus ? (
              <Pressable
                style={[styles.status, { backgroundColor: statusTint }]}
                onPress={() => onStatusToggle?.(booking)}
                disabled={statusTogglePending}
                accessibilityRole="button"
                accessibilityLabel={paused ? "Resume consultation" : "Pause consultation"}
                accessibilityState={{ disabled: statusTogglePending }}
                testID={`consultation-status-toggle-${booking.id}`}
              >
                <View style={[styles.dot, { backgroundColor: status.dot }]} />
                <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
                <Feather name={paused ? "play" : "pause"} size={12} color={status.text} />
              </Pressable>
            ) : (
              <View style={[styles.status, { backgroundColor: statusTint }]}>
                <View style={[styles.dot, { backgroundColor: status.dot }]} />
                <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable
          onPress={toggleExpanded}
          style={styles.expandButton}
          accessibilityLabel={expanded ? "Collapse consultation actions" : "Expand consultation actions"}
        >
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={18} color={palette.mutedForeground} />
        </Pressable>
      </View>

      {expanded && (
        <View style={[styles.actions, { borderTopColor: palette.border }]}>
          <Action
            icon="phone"
            label={startingCall === "voice" ? "Calling…" : "Call"}
            disabled={!callsAvailable || !!startingCall}
            color={callsAvailable ? palette.success : palette.terminal}
            tint={designTokens.color.greenTint}
            onPress={() => startCall("voice")}
          />
          <Action
            icon="video"
            label={startingCall === "video" ? "Calling…" : "Video"}
            disabled={!videoAvailable || !!startingCall}
            color={videoAvailable ? palette.blue : palette.terminal}
            tint={designTokens.color.blueTint}
            onPress={() => startCall("video")}
          />
          <Action
            icon="folder"
            label="Case File"
            color={palette.quiet}
            tint={designTokens.color.plumTint}
            onPress={() => router.push(`/case-file/${booking.id}`)}
          />
          <Action
            icon={seeker ? "file-text" : "edit-3"}
            label={seeker ? "Advisory" : "Advise"}
            disabled={!seeker && !callsAvailable}
            color={palette.primary}
            tint={designTokens.color.coralTint}
            badge={seeker ? booking.caseFileUnreadAdvisories : undefined}
            onPress={() => router.push(`/case-file/${booking.id}?focus=advisory`)}
          />
        </View>
      )}
    </View>
  );
}

function Action({
  icon,
  label,
  disabled,
  color,
  tint,
  badge,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  disabled?: boolean;
  color: string;
  tint: string;
  badge?: number;
  onPress: () => void;
}) {
  const palette = useColors();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.action,
        {
          opacity: disabled ? 0.42 : pressed ? 0.75 : 1,
          transform: [{ scale: pressed ? 0.96 : 1 }],
        },
      ]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      testID={`consultation-action-${label.toLowerCase().replace(" ", "-")}`}
    >
      <View style={[styles.actionIcon, { backgroundColor: tint }]}>
        <Feather name={icon} size={18} color={color} />
        {!!badge && (
          <View style={[styles.badgeCount, { backgroundColor: palette.primary }]}>
            <Text style={[styles.badgeCountText, { color: palette.primaryForeground }]}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 14, paddingHorizontal: 14, borderWidth: 1, borderRadius: 18, ...designTokens.shadow.card },
  rowMain: { flexDirection: "row", alignItems: "center", gap: 12 },
  badge: { width: 46, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  rowBody: { flex: 1, minWidth: 0 },
  rowDetails: { gap: 3 },
  title: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  person: { fontSize: 15, lineHeight: 20, fontFamily: "Sora_600SemiBold" },
  patientContext: { fontSize: 12, lineHeight: 17, fontFamily: "Inter_400Regular" },
  placeLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 2 },
  placeStrong: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  place: { fontSize: 12, fontFamily: "Inter_400Regular" },
  time: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginLeft: 1 },
  scheduleLine: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8, flexWrap: "wrap" },
  status: { flexDirection: "row", alignItems: "center", gap: 5, marginLeft: "auto", minHeight: 24, paddingHorizontal: 8, borderRadius: 999 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  expandButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: -7 },
  actions: { marginTop: 14, marginLeft: 58, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderTopWidth: StyleSheet.hairlineWidth },
  action: { alignItems: "center", gap: 5, minWidth: 52, minHeight: 56 },
  actionIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  actionText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  badgeCount: { position: "absolute", top: -7, right: -9, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  badgeCountText: { fontSize: 10, fontFamily: "Inter_700Bold" },
});