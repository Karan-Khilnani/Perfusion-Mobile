import { Feather, Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { useColors } from "@/hooks/useColors";

export interface Booking {
  id: string;
  bookingNumber?: string;
  serviceName: string;
  serviceType: string;
  status: string;
  scheduledDate?: string;
  timeSlot?: string;
  patientName?: string;
  providerName?: string;
  videoRoomId?: string;
  amount?: string;
}

const STATUS_COLORS: Record<
  string,
  { bg: string; text: string; dot: string }
> = {
  confirmed: {
    bg: "#DCFCE7",
    text: "#15803D",
    dot: "#16A34A",
  },
  pending: {
    bg: "#FEF3C7",
    text: "#B45309",
    dot: "#D97706",
  },
  completed: {
    bg: "#F0F0F0",
    text: "#737373",
    dot: "#9CA3AF",
  },
  cancelled: {
    bg: "#FEE2E2",
    text: "#B91C1C",
    dot: "#DC2626",
  },
  in_progress: {
    bg: "#EFF6FF",
    text: "#1D4ED8",
    dot: "#3B82F6",
  },
};

const SERVICE_ICONS: Record<string, string> = {
  consultation: "user-md",
  lab: "flask",
  teleradiology: "scan",
  emergency: "activity",
  transport: "truck",
};

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function BookingCard({ booking }: { booking: Booking }) {
  const colors = useColors();
  const statusInfo = STATUS_COLORS[booking.status] || {
    bg: colors.muted,
    text: colors.mutedForeground,
    dot: colors.mutedForeground,
  };

  const serviceType = booking.serviceType?.toLowerCase() || "consultation";
  const iconName =
    (SERVICE_ICONS[serviceType] as any) ||
    (SERVICE_ICONS.consultation as any);

  return (
    <Pressable
      onPress={() => router.push(`/booking/${booking.id}`)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      testID={`booking-card-${booking.id}`}
    >
      <View style={styles.iconContainer}>
        <View
          style={[
            styles.iconBg,
            { backgroundColor: `${colors.primary}15` },
          ]}
        >
          <Ionicons
            name="medical"
            size={20}
            color={colors.primary}
          />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text
            style={[styles.serviceName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {booking.serviceName}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statusInfo.bg },
            ]}
          >
            <View
              style={[styles.statusDot, { backgroundColor: statusInfo.dot }]}
            />
            <Text style={[styles.statusText, { color: statusInfo.text }]}>
              {booking.status.replace(/_/g, " ")}
            </Text>
          </View>
        </View>

        {booking.patientName && (
          <Text
            style={[styles.detail, { color: colors.mutedForeground }]}
            numberOfLines={1}
          >
            <Feather name="user" size={11} /> {booking.patientName}
          </Text>
        )}

        <View style={styles.meta}>
          {booking.scheduledDate && (
            <View style={styles.metaItem}>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {formatDate(booking.scheduledDate)}
              </Text>
            </View>
          )}
          {booking.timeSlot && (
            <View style={styles.metaItem}>
              <Feather name="clock" size={11} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {booking.timeSlot}
              </Text>
            </View>
          )}
          {booking.bookingNumber && (
            <View style={styles.metaItem}>
              <Feather name="hash" size={11} color={colors.mutedForeground} />
              <Text style={[styles.metaText, { color: colors.mutedForeground }]}>
                {booking.bookingNumber}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
    gap: 12,
    ...(Platform.OS === "web"
      ? { boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.06,
          shadowRadius: 3,
          elevation: 2,
        }),
  },
  iconContainer: {
    flexShrink: 0,
  },
  iconBg: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    gap: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  serviceName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    textTransform: "capitalize",
  },
  detail: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  metaText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
});
