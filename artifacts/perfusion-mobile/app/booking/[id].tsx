import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface BookingDetail {
  id: string;
  bookingNumber?: string;
  serviceName: string;
  serviceType: string;
  status: string;
  scheduledDate?: string;
  timeSlot?: string;
  patientName?: string;
  patientAge?: number;
  patientGender?: string;
  patientPhone?: string;
  amount?: string;
  videoRoomId?: string;
  providerName?: string;
  notes?: string;
  reportUrl?: string;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function DetailRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: any;
  label: string;
  value?: string | number;
  colors: any;
}) {
  if (!value && value !== 0) return null;
  return (
    <View style={[detailStyles.row, { borderBottomColor: colors.border }]}>
      <Ionicons name={icon} size={16} color={colors.mutedForeground} />
      <View style={detailStyles.rowContent}>
        <Text style={[detailStyles.label, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <Text style={[detailStyles.value, { color: colors.foreground }]}>
          {String(value)}
        </Text>
      </View>
    </View>
  );
}

export default function BookingDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();

  const { data: booking, isLoading, isError } = useQuery<BookingDetail>({
    queryKey: ["booking", id],
    queryFn: async () => {
      const res = await apiFetch(`/api/bookings/${id}`);
      if (!res.ok) throw new Error("Booking not found");
      return res.json();
    },
    enabled: !!id,
  });

  const ringMutation = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/call/ring/${id}`, {
        method: "POST",
        body: JSON.stringify({ callType: "video" }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || data.reason || "Cannot start call");
      }
      return res.json();
    },
    onSuccess: (result) => {
      router.push(`/call/${id}?mode=video&generation=${result.session?.sessionGeneration || ""}`);
    },
    onError: (err: any) => {
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
      Alert.alert(
        "Cannot start call",
        err?.message || "The call window may not be open yet.",
        [{ text: "OK" }]
      );
    },
  });

  const handleJoinCall = async () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    ringMutation.mutate();
  };

  if (isLoading) {
    return (
      <View
        style={[
          styles.center,
          { backgroundColor: colors.background },
        ]}
      >
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (isError || !booking) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={colors.destructive}
        />
        <Text style={[styles.errorText, { color: colors.destructive }]}>
          Booking not found
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: colors.primary }]}>
            Go back
          </Text>
        </Pressable>
      </View>
    );
  }

  const hasVideo =
    !!booking.videoRoomId && booking.status !== "cancelled";
  const isActive =
    booking.status === "confirmed" || booking.status === "in_progress";

  const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
    confirmed: { bg: "#DCFCE7", text: "#15803D" },
    pending: { bg: "#FEF3C7", text: "#B45309" },
    completed: { bg: "#F0F0F0", text: "#737373" },
    cancelled: { bg: "#FEE2E2", text: "#B91C1C" },
    in_progress: { bg: "#EFF6FF", text: "#1D4ED8" },
  };
  const statusStyle = STATUS_COLORS[booking.status] || {
    bg: colors.muted,
    text: colors.mutedForeground,
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: 20,
          paddingBottom:
            Platform.OS === "web" ? 34 : insets.bottom + 24,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topSection}>
        <View
          style={[
            styles.serviceIconBg,
            { backgroundColor: `${colors.primary}12` },
          ]}
        >
          <Ionicons name="medical" size={32} color={colors.primary} />
        </View>
        <Text style={[styles.serviceName, { color: colors.foreground }]}>
          {booking.serviceName}
        </Text>
        <View
          style={[
            styles.statusBadgeLarge,
            { backgroundColor: statusStyle.bg },
          ]}
        >
          <Text
            style={[styles.statusTextLarge, { color: statusStyle.text }]}
          >
            {booking.status.replace(/_/g, " ")}
          </Text>
        </View>
        {booking.bookingNumber && (
          <Text style={[styles.bookingNum, { color: colors.mutedForeground }]}>
            #{booking.bookingNumber}
          </Text>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Appointment Details
        </Text>
        <DetailRow
          icon="calendar-outline"
          label="Date"
          value={formatDate(booking.scheduledDate)}
          colors={colors}
        />
        <DetailRow
          icon="time-outline"
          label="Time Slot"
          value={booking.timeSlot}
          colors={colors}
        />
        <DetailRow
          icon="medkit-outline"
          label="Service Type"
          value={booking.serviceType}
          colors={colors}
        />
        <View style={{ borderBottomWidth: 0 }}>
          <DetailRow
            icon="cash-outline"
            label="Amount"
            value={booking.amount ? `₹${booking.amount}` : undefined}
            colors={colors}
          />
        </View>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Patient Details
        </Text>
        <DetailRow
          icon="person-outline"
          label="Patient Name"
          value={booking.patientName}
          colors={colors}
        />
        <DetailRow
          icon="body-outline"
          label="Age"
          value={booking.patientAge}
          colors={colors}
        />
        <DetailRow
          icon="transgender-outline"
          label="Gender"
          value={booking.patientGender}
          colors={colors}
        />
        <View style={{ borderBottomWidth: 0 }}>
          <DetailRow
            icon="call-outline"
            label="Phone"
            value={booking.patientPhone}
            colors={colors}
          />
        </View>
      </View>

      {booking.notes && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Notes
          </Text>
          <Text
            style={[styles.notesText, { color: colors.foreground }]}
          >
            {booking.notes}
          </Text>
        </View>
      )}

      {hasVideo && isActive && (
        <Pressable
          onPress={handleJoinCall}
          disabled={ringMutation.isPending}
          style={({ pressed }) => [
            styles.joinButton,
            {
              backgroundColor: ringMutation.isPending
                ? `${colors.primary}70`
                : colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          testID="join-call-button"
        >
          {ringMutation.isPending ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Ionicons name="videocam" size={22} color="#fff" />
              <Text style={styles.joinButtonText}>Video Call</Text>
            </>
          )}
        </Pressable>
      )}

      {booking.reportUrl && (
        <Pressable
          onPress={() =>
            WebBrowser.openBrowserAsync(booking.reportUrl!)
          }
          style={({ pressed }) => [
            styles.reportButton,
            {
              backgroundColor: colors.muted,
              borderColor: colors.border,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons
            name="document-text-outline"
            size={20}
            color={colors.foreground}
          />
          <Text style={[styles.reportButtonText, { color: colors.foreground }]}>
            View Report
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  backLink: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  container: {
    paddingHorizontal: 20,
    gap: 16,
  },
  topSection: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  serviceIconBg: {
    width: 70,
    height: 70,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  serviceName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: -0.3,
  },
  statusBadgeLarge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusTextLarge: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    textTransform: "capitalize",
  },
  bookingNum: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    padding: 16,
    paddingBottom: 8,
  },
  notesText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    padding: 16,
    paddingTop: 4,
  },
  joinButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 54,
    borderRadius: 14,
    marginTop: 4,
  },
  joinButtonText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
  },
  reportButtonText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});

const detailStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  value: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
