import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";

import { useAuth } from "@/contexts/AuthContext";
import {
  Booking,
  formatRemainingWindow,
  formatTime,
  isSeekerRole,
  isTerminalStatus,
  statusPresentation,
} from "@/lib/mobile-models";
import { useColors } from "@/hooks/useColors";
import { apiFetch } from "@/hooks/useApi";

export type { Booking };

type Props = {
  booking: Booking;
  onPauseToggle?: (booking: Booking) => void;
};

export function BookingCard({ booking, onPauseToggle }: Props) {
  const palette = useColors();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [startingCall, setStartingCall] = useState<"voice" | "video" | null>(null);
  const seeker = isSeekerRole(user?.role);
  const status = statusPresentation(booking.status, {
    success: palette.success,
    terminal: palette.terminal,
    warning: palette.warning,
    quiet: palette.quiet,
    blue: palette.blue,
  });
  const terminal = isTerminalStatus(booking.status);
  const quietWindow = (booking.status === "ongoing" || booking.status === "in_progress") && !booking.videoRoomId;
  const city = (booking.providerCity || booking.city || booking.providerHospital || "").slice(0, 3).toUpperCase();
  const initials = seeker
    ? city || "—"
    : `${booking.patientAge || "—"}${booking.patientGender ? booking.patientGender.slice(0, 1).toUpperCase() : ""}`;
  const title = seeker
    ? `${booking.providerSpecialization || booking.serviceName || "Consultation"} · ${booking.providerName || "Consultant"}`
    : booking.patientName || "Patient";
  const place = seeker
    ? booking.providerHospital || booking.hospitalName || "Specialist network"
    : booking.seekerHospitalName || booking.hospitalName || "Hospital";
  const time = formatTime(booking.appointmentSlot || booking.timeSlot || booking.scheduledDate);
  const remaining = formatRemainingWindow((booking as Booking & { postRxExpiresAt?: string }).postRxExpiresAt);
  const callsAvailable = !terminal && (booking.postRxCallsEnabled ?? true);
  const videoAvailable = !terminal && (booking.postRxVideoEnabled ?? true);

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
      router.push(`/call/${booking.id}?mode=${callType}`);
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
    <View style={[styles.row, { borderBottomColor: palette.border }]}>
      <View style={styles.rowMain}>
        <View style={[styles.badge, { backgroundColor: seeker ? `${palette.blue}12` : palette.accent }]}>
          <Text style={[styles.badgeText, { color: seeker ? palette.blue : palette.foreground }]}>{initials}</Text>
        </View>
        <Pressable
          style={styles.rowBody}
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          testID={`consultation-row-${booking.id}`}
        >
          <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
          <View style={styles.placeLine}>
            <Text style={[styles.placeStrong, { color: palette.foreground }]}>{seeker ? place.split(",")[0] : place}</Text>
            {seeker && place.includes(",") ? <Text style={[styles.place, { color: palette.mutedForeground }]}>{`, ${place.split(",").slice(1).join(",").trim()}`}</Text> : null}
            <Text style={[styles.time, { color: palette.mutedForeground }]}>{time}</Text>
          </View>
          <View style={styles.patientLine}>
            <Text style={[styles.patient, { color: palette.mutedForeground }]}>{seeker ? booking.patientName || "Patient" : place}</Text>
            <View style={styles.status}>
              <View style={[styles.dot, { backgroundColor: status.dot }, status.label === "Ongoing" && !quietWindow ? styles.liveDot : undefined]} />
              <Text style={[styles.statusText, { color: quietWindow ? palette.quiet : status.text }]}>
                {quietWindow && remaining ? `Ongoing · ${remaining}` : status.label}
              </Text>
            </View>
          </View>
        </Pressable>
        <Pressable
          onPress={() => setExpanded((value) => !value)}
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
            color={palette.foreground}
            onPress={() => startCall("voice")}
          />
          <Action
            icon="video"
            label={startingCall === "video" ? "Calling…" : "Video"}
            disabled={!videoAvailable || !!startingCall}
            color={palette.foreground}
            onPress={() => startCall("video")}
          />
          <Action
            icon="folder"
            label="Case File"
            color={palette.foreground}
            onPress={() => router.push(`/case-file/${booking.id}`)}
          />
          <Action
            icon={seeker ? "file-text" : "edit-3"}
            label={seeker ? "Advisory" : "Advise"}
            disabled={!seeker && !callsAvailable}
            color={palette.foreground}
            badge={seeker ? booking.caseFileUnreadAdvisories : undefined}
            onPress={() => router.push(`/case-file/${booking.id}?focus=advisory`)}
          />
          {!seeker && onPauseToggle && !terminal && (
            <Pressable
              style={styles.pauseWord}
              onPress={() => onPauseToggle(booking)}
              testID={`pause-follow-up-${booking.id}`}
            >
              <Text style={[styles.pauseText, { color: palette.quiet }]}>
                {booking.postRxCallsEnabled === false && booking.postRxVideoEnabled === false ? "Paused" : "Ongoing"}
              </Text>
              <Text style={[styles.pauseHint, { color: palette.mutedForeground }]}>Tap status to pause follow-up</Text>
            </Pressable>
          )}
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
  badge,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  disabled?: boolean;
  color: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.action, { opacity: disabled ? 0.35 : pressed ? 0.65 : 1 }]}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      testID={`consultation-action-${label.toLowerCase().replace(" ", "-")}`}
    >
      <View>
        <Feather name={icon} size={19} color={color} />
        {!!badge && <View style={styles.badgeCount}><Text style={styles.badgeCountText}>{badge}</Text></View>}
      </View>
      <Text style={[styles.actionText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowMain: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  badge: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", marginTop: 1 },
  badgeText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: -0.2 },
  rowBody: { flex: 1, minWidth: 0, gap: 5 },
  title: { fontSize: 15, lineHeight: 20, fontFamily: "Inter_600SemiBold" },
  placeLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 2 },
  placeStrong: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  place: { fontSize: 12, fontFamily: "Inter_400Regular" },
  time: { fontSize: 12, fontFamily: "Inter_500Medium", marginLeft: 5 },
  patientLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  patient: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular" },
  status: { flexDirection: "row", alignItems: "center", gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  liveDot: { borderWidth: 2, borderColor: "#DB2841", width: 9, height: 9, borderRadius: 5 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  expandButton: { padding: 7, marginRight: -5, marginTop: -4 },
  actions: { marginTop: 12, marginLeft: 60, paddingTop: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderTopWidth: StyleSheet.hairlineWidth },
  action: { alignItems: "center", gap: 5, minWidth: 53 },
  actionText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  badgeCount: { position: "absolute", top: -7, right: -9, minWidth: 16, height: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: "#DB2841", alignItems: "center", justifyContent: "center" },
  badgeCountText: { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_700Bold" },
  pauseWord: { position: "absolute", left: 0, right: 0, top: 54, alignItems: "center" },
  pauseText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  pauseHint: { fontSize: 10, fontFamily: "Inter_400Regular", marginTop: 2 },
});