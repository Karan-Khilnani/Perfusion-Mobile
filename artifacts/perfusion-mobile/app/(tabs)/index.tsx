import { Feather, Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BookingCard, type Booking } from "@/components/BookingCard";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

function useBookings(role?: string) {
  return useQuery<Booking[]>({
    queryKey: ["bookings", role],
    queryFn: async () => {
      const endpoint =
        role === "provider" ? "/api/provider/bookings" : "/api/bookings";
      const res = await apiFetch(endpoint);
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
    enabled: !!role,
    staleTime: 30_000,
  });
}

export default function DashboardScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const {
    data: bookings,
    isLoading,
    isError,
    refetch,
    isRefetching,
  } = useBookings(user?.role);

  const activeBookings =
    bookings?.filter(
      (booking) => !["completed", "cancelled"].includes(booking.status)
    ) ?? [];
  const upcoming = activeBookings.slice(0, 5);
  const todayBookings =
    activeBookings.filter((b) => {
      if (!b.scheduledDate) return false;
      const d = new Date(b.scheduledDate);
      const today = new Date();
      return (
        d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear()
      );
    });
  const isProvider = user?.role === "provider";

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 16,
          paddingBottom:
            Platform.OS === "web" ? 84 + 34 : insets.bottom + 80,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.greeting}>
        <View>
          <Text style={[styles.greetingText, { color: colors.mutedForeground }]}>
            {greeting()},
          </Text>
          <Text style={[styles.userName, { color: colors.foreground }]}>
            {user?.name || user?.email || "User"}
          </Text>
        </View>
        <View
          style={[
            styles.avatarCircle,
            { backgroundColor: `${colors.primary}18` },
          ]}
        >
          <Ionicons name="person" size={22} color={colors.primary} />
        </View>
      </View>

      {todayBookings.length > 0 && (
        <View
          style={[
            styles.todayBanner,
            { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}20` },
          ]}
        >
          <Ionicons name="today-outline" size={18} color={colors.primary} />
          <Text style={[styles.todayText, { color: colors.primary }]}>
            {todayBookings.length} {isProvider ? "assigned " : ""}
            appointment{todayBookings.length > 1 ? "s" : ""} today
          </Text>
        </View>
      )}

      <View style={styles.statsRow}>
        <StatCard
          icon="calendar"
          label={isProvider ? "Assigned" : "Upcoming"}
          value={String(activeBookings.length)}
          colors={colors}
        />
        <StatCard
          icon="today"
          label="Today"
          value={String(todayBookings.length)}
          colors={colors}
          highlight
        />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
             {isProvider ? "Assigned Appointments" : "Upcoming Appointments"}
          </Text>
          <Pressable onPress={() => router.push("/(tabs)/bookings")}>
            <Text style={[styles.seeAll, { color: colors.primary }]}>
              See all
            </Text>
          </Pressable>
        </View>

        {isLoading && (
          <View style={styles.loader}>
            <ActivityIndicator color={colors.primary} />
          </View>
        )}

        {isError && (
          <View
            style={[
              styles.errorBox,
              { backgroundColor: `${colors.destructive}10`, borderColor: `${colors.destructive}20` },
            ]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color={colors.destructive}
            />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              Failed to load bookings
            </Text>
            <Pressable onPress={() => refetch()}>
              <Text style={[styles.retryText, { color: colors.primary }]}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {!isLoading && !isError && upcoming.length === 0 && (
          <View style={styles.empty}>
            <Ionicons
              name="calendar-outline"
              size={40}
              color={colors.mutedForeground}
            />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
               {isProvider
                 ? "No assigned appointments"
                 : "No upcoming appointments"}
            </Text>
          </View>
        )}

        {upcoming.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </View>
    </ScrollView>
  );
}

function StatCard({
  icon,
  label,
  value,
  colors,
  highlight,
}: {
  icon: any;
  label: string;
  value: string;
  colors: any;
  highlight?: boolean;
}) {
  return (
    <View
      style={[
        styles.statCard,
        {
          backgroundColor: highlight
            ? `${colors.primary}12`
            : colors.card,
          borderColor: highlight
            ? `${colors.primary}25`
            : colors.border,
        },
      ]}
    >
      <Ionicons
        name={icon}
        size={20}
        color={highlight ? colors.primary : colors.mutedForeground}
      />
      <Text
        style={[
          styles.statValue,
          { color: highlight ? colors.primary : colors.foreground },
        ]}
      >
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 20,
  },
  greeting: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  greetingText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  userName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.3,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  todayBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  todayText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 6,
  },
  statValue: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
  },
  statLabel: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  seeAll: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  loader: {
    paddingVertical: 32,
    alignItems: "center",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  retryText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
});
