import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import React from "react";
import {
  Alert,
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

import { BookingCard } from "@/components/BookingCard";
import { BrandMark } from "@/components/BrandMark";
import { ScreenHeading } from "@/components/ScreenHeading";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { Booking, isSeekerRole } from "@/lib/mobile-models";

function useConsultations(role?: string) {
  return useQuery<Booking[]>({
    queryKey: ["consultations", role],
    queryFn: async () => {
      const endpoint = role === "provider" ? "/api/provider/bookings" : "/api/bookings";
      const response = await apiFetch(endpoint);
      if (!response.ok) throw new Error("Unable to load consultations");
      return response.json();
    },
    enabled: !!role,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardScreen() {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const seeker = isSeekerRole(user?.role);
  const consultations = useConsultations(user?.role);
  const bookings = [...(consultations.data || [])]
    .sort((a, b) => {
      const aDate = new Date(a.scheduledDate || a.appointmentSlot || 0).getTime();
      const bDate = new Date(b.scheduledDate || b.appointmentSlot || 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 20);

  const consultationStatus = useMutation({
    mutationFn: async (booking: Booking) => {
      const status = booking.status.toLowerCase() === "paused" ? "ongoing" : "paused";
      const response = await apiFetch(`/api/bookings/${booking.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || result.message || "Could not update consultation status");
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultations", user?.role] });
      queryClient.invalidateQueries({ queryKey: ["case-file"] });
    },
    onError: (error) => {
      Alert.alert("Status not updated", error instanceof Error ? error.message : "Please try again.");
    },
  });

  const liveCount = bookings.filter((item) => ["ongoing", "in_progress", "processing"].includes(item.status)).length;
  const name = user?.firstName || user?.name?.split(" ")[0] || "there";
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const hospitalPlace = user?.hospitalAddress || user?.location || user?.city;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 76 : insets.top + 16,
          paddingBottom: Platform.OS === "web" ? 126 : insets.bottom + 98,
        },
      ]}
      refreshControl={<RefreshControl refreshing={consultations.isRefetching} onRefresh={consultations.refetch} tintColor={palette.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.brandRow}>
        <BrandMark />
        <View style={styles.headerActions}>
          <Pressable style={[styles.headerIcon, { borderColor: palette.border }]} accessibilityLabel="Help">
            <Feather name="help-circle" size={18} color={palette.foreground} />
          </Pressable>
          <Pressable style={[styles.headerIcon, { borderColor: palette.border }]} accessibilityLabel="Notifications">
            <Feather name="bell" size={18} color={palette.foreground} />
            {liveCount > 0 && <View style={[styles.notificationDot, { backgroundColor: palette.primary }]} />}
          </Pressable>
        </View>
      </View>

      <View style={styles.greetingBlock}>
        <ScreenHeading
          title={`${greeting()}, Dr. ${name}`}
          subtitle={`${date}${seeker && user?.hospitalName ? ` · ${user.hospitalName}${hospitalPlace ? ` · ${hospitalPlace}` : ""}` : ""}`}
        />
      </View>

      {seeker ? (
        <Pressable
          style={({ pressed }) => [styles.newConsultation, { backgroundColor: palette.primary, opacity: pressed ? 0.9 : 1 }]}
          onPress={() => router.push("/new-consultation")}
          testID="new-consultation-button"
        >
          <View style={styles.newConsultationIcon}><Feather name="plus" size={20} color={palette.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.newConsultationTitle}>New Consultation</Text>
            <Text style={styles.newConsultationSubtitle}>Find a specialist for your patient</Text>
          </View>
          <Feather name="arrow-right" size={19} color="#FFFFFF" />
        </Pressable>
      ) : liveCount > 0 ? (
        <View style={[styles.liveBanner, { borderColor: `${palette.primary}25`, backgroundColor: `${palette.primary}08` }]}>
          <View style={[styles.livePulse, { backgroundColor: palette.primary }]} />
          <Text style={[styles.liveBannerText, { color: palette.foreground }]}>
            {liveCount} consultation{liveCount > 1 ? "s" : ""} ongoing
          </Text>
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <View>
          <Text style={[styles.sectionTitle, { color: palette.foreground }]}>
            {seeker ? "Active Consultations" : "Recent Consultations"}
          </Text>
          <Text style={[styles.sectionMeta, { color: palette.mutedForeground }]}>{bookings.length} of {consultations.data?.length || 0}</Text>
        </View>
        <Pressable onPress={() => router.push("/(tabs)/consultations")}>
          <Text style={[styles.viewAll, { color: palette.foreground }]}>View all</Text>
        </Pressable>
      </View>

      <View style={[styles.list, { backgroundColor: palette.card, borderColor: palette.border }]}>
        {consultations.isLoading ? (
          <View style={styles.state}>
            <ActivityIndicator color={palette.primary} />
            <Text style={[styles.stateText, { color: palette.mutedForeground }]}>Loading consultations…</Text>
          </View>
        ) : consultations.isError ? (
          <View style={styles.state}>
            <Feather name="alert-circle" size={30} color={palette.primary} />
            <Text style={[styles.stateTitle, { color: palette.foreground }]}>Couldn’t load consultations</Text>
            <Pressable onPress={() => consultations.refetch()}><Text style={[styles.retry, { color: palette.primary }]}>Retry</Text></Pressable>
          </View>
        ) : bookings.length === 0 ? (
          <View style={styles.state}>
            <Feather name="phone-call" size={30} color={palette.mutedForeground} />
            <Text style={[styles.stateTitle, { color: palette.foreground }]}>No consultations yet</Text>
            <Text style={[styles.stateText, { color: palette.mutedForeground }]}>
              {seeker ? "Book a specialist consultation to begin." : "Your consultation history will appear here once patients are booked in."}
            </Text>
          </View>
        ) : (
          bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              onStatusToggle={user?.role === "provider" ? (value) => consultationStatus.mutate(value) : undefined}
              statusTogglePending={consultationStatus.isPending}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 18 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerActions: { flexDirection: "row", gap: 8 },
  headerIcon: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  notificationDot: { position: "absolute", top: 8, right: 8, width: 6, height: 6, borderRadius: 3 },
  greetingBlock: { marginTop: 30, marginBottom: 22, gap: 5 },
  greeting: { fontSize: 25, lineHeight: 31, fontFamily: "Sora_700Bold", letterSpacing: -0.6 },
  date: { fontSize: 13, fontFamily: "Inter_400Regular" },
  newConsultation: { borderRadius: 16, minHeight: 76, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 26 },
  newConsultationIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  newConsultationTitle: { color: "#FFFFFF", fontSize: 16, fontFamily: "Sora_600SemiBold" },
  newConsultationSubtitle: { color: "rgba(255,255,255,.78)", fontSize: 12, marginTop: 3, fontFamily: "Inter_400Regular" },
  liveBanner: { borderWidth: 1, borderRadius: 13, minHeight: 50, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 24 },
  livePulse: { width: 8, height: 8, borderRadius: 4 },
  liveBannerText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 11 },
  sectionTitle: { fontSize: 17, fontFamily: "Sora_600SemiBold" },
  sectionMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  viewAll: { fontSize: 12, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
  list: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, overflow: "hidden" },
  state: { alignItems: "center", paddingVertical: 44, paddingHorizontal: 20, gap: 9 },
  stateTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", textAlign: "center" },
  stateText: { fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular", textAlign: "center" },
  retry: { fontSize: 13, fontFamily: "Inter_600SemiBold", padding: 6 },
});