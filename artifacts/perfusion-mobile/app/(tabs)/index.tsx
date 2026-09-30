import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppAlert } from "@/components/AppAlert";
import { BookingCard } from "@/components/BookingCard";
import { ConsultationSkeletons, StateCard } from "@/components/SharedStates";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { BRAND_GRADIENT, designTokens } from "@/constants/designTokens";
import { cardShadow } from "@/constants/nativeShadows";
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
  const [remindersOpen, setRemindersOpen] = React.useState(false);
  const callbackReminders = useQuery<Array<{ bookingId: string; patientName: string; deviceName: string | null; dueAt: string | null }>>({
    queryKey: ["mobile-callback-device-reminders"],
    enabled: seeker,
    queryFn: async () => {
      const response = await apiFetch("/api/callback-device/reminders");
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "Unable to load due callback confirmations.");
      return body as Array<{ bookingId: string; patientName: string; deviceName: string | null; dueAt: string | null }>;
    },
    refetchInterval: 15_000,
  });
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
      AppAlert.alert("Status not updated", error instanceof Error ? error.message : "Please try again.");
    },
  });

  const liveCount = bookings.filter((item) => ["ongoing", "in_progress", "processing"].includes(item.status)).length;
  const name = user?.firstName || user?.name?.split(" ")[0] || "there";
  const date = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  const hospitalPlace = user?.hospitalAddress || user?.location || user?.city;

  return (
    <>
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 126 : insets.bottom + 98 }}
      refreshControl={<RefreshControl refreshing={consultations.isRefetching} onRefresh={consultations.refetch} tintColor={palette.primary} />}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={BRAND_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: Platform.OS === "web" ? 76 : insets.top + 18 }]}
      >
        <View style={styles.heroTop}>
          <Text style={styles.heroEyebrow}>PERFUSION</Text>
          <Pressable
            style={({ pressed }) => [styles.headerIcon, { opacity: pressed ? 0.8 : 1 }]}
            accessibilityLabel="Notifications"
            accessibilityRole="button"
            disabled={!seeker}
            onPress={() => setRemindersOpen(true)}
          >
            <Feather name="bell" size={19} color="#FFFFFF" />
            {liveCount > 0 && <View style={styles.notificationDot} />}
            {seeker && !!callbackReminders.data?.length && (
              <View style={styles.reminderBadge}>
                <Text style={styles.reminderBadgeText}>{callbackReminders.data.length > 9 ? "9+" : callbackReminders.data.length}</Text>
              </View>
            )}
          </Pressable>
        </View>
        <Text style={styles.heroGreeting}>{greeting()}</Text>
        <Text style={styles.heroName}>
          {user?.role === "provider" && !/^dr\.?\s/i.test(name) ? `Dr. ${name}` : name}
        </Text>
        <Text style={styles.heroSubtitle}>
          {date}{seeker && user?.hospitalName ? ` · ${user.hospitalName}${hospitalPlace ? ` · ${hospitalPlace}` : ""}` : ""}
        </Text>
        {liveCount > 0 && (
          <View style={styles.livePill}>
            <View style={styles.livePulse} />
            <Text style={styles.livePillText}>{liveCount} ongoing</Text>
          </View>
        )}
      </LinearGradient>

      <View style={styles.content}>

      {seeker ? (
        <Pressable
          onPress={() => router.push("/new-consultation")}
          testID="new-consultation-button"
        >
          {({ pressed }) => (
            <LinearGradient
              colors={BRAND_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.newConsultation, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
            >
              <View style={styles.newConsultationIcon}><Feather name="plus" size={20} color={palette.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.newConsultationTitle}>New Consultation</Text>
                <Text style={styles.newConsultationSubtitle}>Find a specialist for your patient</Text>
              </View>
              <Feather name="arrow-right" size={19} color="#FFFFFF" />
            </LinearGradient>
          )}
        </Pressable>
      ) : liveCount > 0 ? (
        <View style={[styles.providerLiveBanner, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.livePulse} />
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
          <Text style={[styles.viewAll, { color: palette.primary }]}>View all consultations</Text>
        </Pressable>
      </View>

      <View style={styles.list}>
        {consultations.isLoading ? (
          <ConsultationSkeletons count={2} />
        ) : consultations.isError ? (
          <StateCard
            variant="error"
            icon="wifi-off"
            title="Couldn’t load consultations"
            message="Check your connection and try again."
            actionLabel="Retry"
            onAction={() => void consultations.refetch()}
          />
        ) : bookings.length === 0 ? (
          <StateCard
            icon="phone-call"
            title="No consultations yet"
            message={seeker ? "Book a specialist consultation to begin." : "Your consultation history will appear here once patients are booked in."}
            actionLabel={seeker ? "Find a consultant" : undefined}
            onAction={seeker ? () => router.push("/new-consultation") : undefined}
          />
        ) : (
          bookings.map((booking) => (
            <BookingCard
              key={booking.id}
              booking={booking}
              dashboard
              onStatusToggle={user?.role === "provider" ? (value) => consultationStatus.mutate(value) : undefined}
              statusTogglePending={consultationStatus.isPending}
            />
          ))
        )}
      </View>
      </View>
    </ScrollView>
    <Modal visible={remindersOpen} transparent animationType="slide" onRequestClose={() => setRemindersOpen(false)}>
      <View style={styles.reminderBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setRemindersOpen(false)} />
        <View style={[styles.reminderSheet, { backgroundColor: palette.card, borderColor: palette.border, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.reminderHeading}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.reminderTitle, { color: palette.foreground }]}>Callback confirmations</Text>
              <Text style={[styles.reminderSubtitle, { color: palette.mutedForeground }]}>Due for your consultation bookings</Text>
            </View>
            <Pressable onPress={() => setRemindersOpen(false)} accessibilityLabel="Close reminders"><Feather name="x" size={20} color={palette.foreground} /></Pressable>
          </View>
          {callbackReminders.isLoading ? (
            <View style={styles.reminderState}><ActivityIndicator color={palette.primary} /><Text style={{ color: palette.mutedForeground }}>Checking confirmations…</Text></View>
          ) : callbackReminders.isError ? (
            <View style={styles.reminderState}>
              <Text style={{ color: palette.destructive, textAlign: "center" }}>{callbackReminders.error instanceof Error ? callbackReminders.error.message : "Unable to load confirmations."}</Text>
              <Pressable onPress={() => void callbackReminders.refetch()}><Text style={{ color: palette.primary, fontFamily: "Inter_600SemiBold" }}>Try again</Text></Pressable>
            </View>
          ) : callbackReminders.data?.length ? (
            <ScrollView contentContainerStyle={{ gap: 9 }}>
              {callbackReminders.data.map((item) => (
                <Pressable
                  key={item.bookingId}
                  onPress={() => {
                    setRemindersOpen(false);
                    router.push(`/case-file/${encodeURIComponent(item.bookingId)}`);
                  }}
                  style={[styles.reminderItem, { backgroundColor: palette.background, borderColor: palette.border }]}
                >
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.reminderPatient, { color: palette.foreground }]}>{item.patientName}</Text>
                    <Text style={[styles.reminderDetail, { color: palette.mutedForeground }]}>
                      {item.deviceName || "Callback device"}{item.dueAt ? ` · due ${new Date(item.dueAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` : ""}
                    </Text>
                  </View>
                  <Feather name="arrow-right" size={17} color={palette.primary} />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.reminderState}>
              <Feather name="check-circle" size={27} color={palette.success} />
              <Text style={{ color: palette.mutedForeground, textAlign: "center" }}>No callback confirmations are due.</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: 20, paddingBottom: 24, borderBottomLeftRadius: 26, borderBottomRightRadius: 26 },
  heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroEyebrow: { color: "rgba(255,255,255,.78)", fontSize: 11, letterSpacing: 1.5, fontFamily: "Inter_700Bold" },
  headerIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,.16)", alignItems: "center", justifyContent: "center" },
  notificationDot: { position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: designTokens.color.coral },
  reminderBadge: { position: "absolute", top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: designTokens.color.coral, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#FFFFFF", paddingHorizontal: 3 },
  reminderBadgeText: { color: "#FFFFFF", fontSize: 9, fontFamily: "Inter_700Bold" },
  heroGreeting: { marginTop: 20, color: "rgba(255,255,255,.86)", fontSize: 14, fontFamily: "Inter_500Medium" },
  heroName: { color: "#FFFFFF", fontSize: 27, lineHeight: 35, fontFamily: "Sora_700Bold", letterSpacing: -0.5, marginTop: 1 },
  heroSubtitle: { color: "rgba(255,255,255,.78)", fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular", marginTop: 5 },
  livePill: { marginTop: 14, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 7, minHeight: 28, paddingHorizontal: 11, borderRadius: 999, backgroundColor: "rgba(255,255,255,.16)" },
  livePulse: { width: 7, height: 7, borderRadius: 4, backgroundColor: designTokens.color.greenBright },
  livePillText: { color: "#FFFFFF", fontSize: 11, fontFamily: "Inter_600SemiBold" },
  content: { paddingHorizontal: 16, paddingTop: 20, gap: 18 },
  newConsultation: { borderRadius: 18, minHeight: 76, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 13, ...cardShadow },
  newConsultationIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  newConsultationTitle: { color: "#FFFFFF", fontSize: 16, fontFamily: "Sora_600SemiBold" },
  newConsultationSubtitle: { color: "rgba(255,255,255,.82)", fontSize: 12, marginTop: 3, fontFamily: "Inter_400Regular" },
  providerLiveBanner: { borderWidth: 1, borderRadius: 16, minHeight: 48, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  liveBannerText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  sectionHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 11 },
  sectionTitle: { fontSize: 18, fontFamily: "Sora_600SemiBold" },
  sectionMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  viewAll: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  list: { gap: 12 },
  reminderBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  reminderSheet: { maxHeight: "76%", borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 18, paddingTop: 20, gap: 16 },
  reminderHeading: { flexDirection: "row", alignItems: "center", gap: 14 },
  reminderTitle: { fontSize: 19, fontFamily: "Sora_600SemiBold" },
  reminderSubtitle: { fontSize: 12, marginTop: 4, fontFamily: "Inter_400Regular" },
  reminderState: { minHeight: 135, alignItems: "center", justifyContent: "center", gap: 10 },
  reminderItem: { minHeight: 63, borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 10 },
  reminderPatient: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  reminderDetail: { fontSize: 11, fontFamily: "Inter_400Regular" },
});