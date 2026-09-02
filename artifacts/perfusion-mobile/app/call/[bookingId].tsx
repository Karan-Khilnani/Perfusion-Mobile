import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface CallInfo {
  videoRoomId?: string;
  serviceName?: string;
  patientName?: string;
}

interface CallStatus {
  status: string;
  isCaller?: boolean;
}

export default function CallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bookingId } = useLocalSearchParams<{ bookingId: string }>();

  const { data: booking, isLoading } = useQuery<CallInfo>({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      const res = await apiFetch(`/api/bookings/${bookingId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!bookingId,
  });

  const { data: tokenData } = useQuery<{ token: string; userName: string }>({
    queryKey: ["daily-token", bookingId, booking?.videoRoomId],
    queryFn: async () => {
      const encodedUrl = encodeURIComponent(booking!.videoRoomId!);
      const res = await apiFetch(
        `/api/bookings/room/${encodedUrl}/daily-token`
      );
      if (!res.ok) throw new Error("Token error");
      return res.json();
    },
    enabled: !!booking?.videoRoomId,
  });

  const { data: callStatus } = useQuery<CallStatus>({
    queryKey: ["call-status", bookingId],
    queryFn: async () => {
      const res = await apiFetch(`/api/call/status/${bookingId}`);
      if (!res.ok) throw new Error("Call status unavailable");
      return res.json();
    },
    enabled: !!bookingId,
  });

  const handleOpenRoom = async () => {
    if (!booking?.videoRoomId || !tokenData?.token) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const separator = booking.videoRoomId.includes("?") ? "&" : "?";
    const url = `${booking.videoRoomId}${separator}t=${encodeURIComponent(tokenData.token)}&prejoinUI=false`;
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle:
        WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
    });
  };

  const handleEndCall = async () => {
    try {
      if (callStatus?.status && callStatus.status !== "none") {
        const action = callStatus.isCaller ? "cancel" : "decline";
        await apiFetch(`/api/call/${action}/${bookingId}`, { method: "POST" });
      }
    } catch {}
    router.back();
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: "#0A0A0A",
          paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 16,
          paddingBottom:
            Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 32,
        },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={handleEndCall} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </Pressable>
        <Text style={styles.topTitle}>
          {booking?.serviceName || "Consultation"}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.avatarArea,
            { backgroundColor: `${colors.primary}18` },
          ]}
        >
          <Ionicons name="medical" size={64} color={colors.primary} />
        </View>
        <Text style={styles.consultTitle}>
          {booking?.serviceName || "Consultation"}
        </Text>
        {booking?.patientName && (
          <Text style={styles.patientName}>{booking.patientName}</Text>
        )}
        <Text style={styles.hint}>
          Tap below to join the video consultation
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleOpenRoom}
          disabled={!booking?.videoRoomId || !tokenData?.token}
          style={({ pressed }) => [
            styles.joinBtn,
            {
              backgroundColor: !booking?.videoRoomId || !tokenData?.token
                ? `${colors.primary}50`
                : colors.primary,
              opacity: pressed ? 0.9 : 1,
            },
          ]}
          testID="open-video-room"
        >
          <Ionicons name="videocam" size={22} color="#fff" />
          <Text style={styles.joinBtnText}>
            {tokenData?.token ? "Join Video Call" : "Preparing Secure Call…"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleEndCall}
          style={({ pressed }) => [
            styles.endBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
          <Text style={styles.endBtnText}>Leave</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
    flex: 1,
    textAlign: "center",
  },
  body: {
    alignItems: "center",
    gap: 12,
  },
  avatarArea: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  consultTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
  },
  patientName: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.6)",
    textAlign: "center",
  },
  hint: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.5)",
    textAlign: "center",
    marginTop: 8,
  },
  actions: {
    gap: 14,
    paddingBottom: 8,
  },
  joinBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    height: 56,
    borderRadius: 14,
  },
  joinBtnText: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    color: "#FFFFFF",
  },
  endBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 44,
  },
  endBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
    color: "#EF4444",
  },
});
