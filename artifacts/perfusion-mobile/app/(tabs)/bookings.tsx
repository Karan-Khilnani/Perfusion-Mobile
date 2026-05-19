import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React, { useState } from "react";
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
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
];

export default function BookingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState("all");

  const { data, isLoading, isError, refetch, isRefetching } = useQuery<
    Booking[]
  >({
    queryKey: ["bookings", filter],
    queryFn: async () => {
      const qs = filter !== "all" ? `?status=${filter}` : "";
      const res = await apiFetch(`/api/bookings${qs}`);
      if (!res.ok) throw new Error("Failed to load bookings");
      return res.json();
    },
    staleTime: 30_000,
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.filterBar,
          {
            borderBottomColor: colors.border,
            paddingTop:
              Platform.OS === "web" ? 67 + insets.top : insets.top + 8,
          },
        ]}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterChip,
                {
                  backgroundColor:
                    filter === f.key ? colors.primary : colors.muted,
                  borderColor:
                    filter === f.key ? colors.primary : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  {
                    color:
                      filter === f.key
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                  },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.list,
          {
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
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        )}

        {isError && (
          <View style={styles.center}>
            <Ionicons
              name="alert-circle-outline"
              size={40}
              color={colors.destructive}
            />
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              Failed to load bookings
            </Text>
            <Pressable
              onPress={() => refetch()}
              style={[
                styles.retryButton,
                { backgroundColor: colors.primary },
              ]}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        )}

        {!isLoading && !isError && (!data || data.length === 0) && (
          <View style={styles.center}>
            <Ionicons
              name="calendar-outline"
              size={48}
              color={colors.mutedForeground}
            />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              No bookings found
            </Text>
            <Text
              style={[styles.emptySubtext, { color: colors.mutedForeground }]}
            >
              {filter !== "all"
                ? `No ${filter} bookings`
                : "Your bookings will appear here"}
            </Text>
          </View>
        )}

        {data?.map((booking) => (
          <BookingCard key={booking.id} booking={booking} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  filterBar: {
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  filterScroll: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: "row",
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 0,
  },
  center: {
    alignItems: "center",
    paddingVertical: 60,
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  retryButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtext: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
