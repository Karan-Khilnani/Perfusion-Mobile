import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  PermissionsAndroid,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CallMedia } from "@/components/CallMedia";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

interface CallInfo {
  videoRoomId?: string;
  serviceName?: string;
  patientName?: string;
  seekerHospitalName?: string;
}

interface CallStatus {
  status: "none" | "ringing" | "accepted" | "declined" | "timeout" | "ended";
  isCaller?: boolean;
  callType?: "voice" | "video";
  videoRoomUrl?: string;
  sessionGeneration?: string;
}

export default function CallScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { bookingId, mode, generation } = useLocalSearchParams<{
    bookingId: string;
    mode?: "voice" | "video";
    generation?: string;
  }>();
  const [roomAttempt, setRoomAttempt] = useState(0);
  const [permissionsReady, setPermissionsReady] = useState(Platform.OS !== "android");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [roomError, setRoomError] = useState(false);
  const [endPending, setEndPending] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  const { data: booking, isLoading } = useQuery<CallInfo>({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      const res = await apiFetch(`/api/bookings/${bookingId}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!bookingId,
  });
  const callTitle = booking?.seekerHospitalName || booking?.serviceName || "Consultation";

  const { data: callStatus, isLoading: statusLoading, isError: statusError } = useQuery<CallStatus>({
    queryKey: ["call-status", bookingId],
    queryFn: async () => {
      const res = await apiFetch(`/api/call/status/${bookingId}`);
      if (!res.ok) throw new Error("Call status unavailable");
      return res.json();
    },
    enabled: !!bookingId,
    refetchInterval: 2000,
  });
  const currentSession = !generation || callStatus?.sessionGeneration === generation;
  const currentStatus = currentSession ? callStatus?.status : "ended";
  // The session is authoritative; the route mode is only used while it loads.
  const callMode = callStatus?.callType || (mode === "voice" ? "voice" : "video");

  const { data: tokenData, isError: tokenError } = useQuery<{ token: string; userName: string }>({
    queryKey: ["daily-token", bookingId, callStatus?.videoRoomUrl],
    queryFn: async () => {
      const encodedUrl = encodeURIComponent(callStatus!.videoRoomUrl!);
      const res = await apiFetch(
        `/api/bookings/room/${encodedUrl}/daily-token`
      );
      if (!res.ok) throw new Error("Token error");
      return res.json();
    },
    enabled: !!callStatus?.videoRoomUrl && currentStatus === "accepted",
  });

  useEffect(() => {
    if (Platform.OS !== "android" || currentStatus !== "accepted") return;

    const requestMediaPermissions = async () => {
      const permissions = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
      if (callMode === "video") {
        permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }
      const results = await PermissionsAndroid.requestMultiple(permissions);
      const granted = permissions.every(
        (permission) => results[permission] === PermissionsAndroid.RESULTS.GRANTED
      );
      setPermissionsReady(granted);
      setPermissionDenied(!granted);
    };

    requestMediaPermissions().catch(() => setPermissionDenied(true));
  }, [callMode, currentStatus]);

  const roomUrl = useMemo(() => {
    if (!callStatus?.videoRoomUrl || !tokenData?.token || currentStatus !== "accepted") return null;
    const separator = callStatus.videoRoomUrl.includes("?") ? "&" : "?";
    const params = [
      `t=${encodeURIComponent(tokenData.token)}`,
      "prejoinUI=false",
      callMode === "voice" ? "startVideoOff=true" : null,
    ]
      .filter(Boolean)
      .join("&");
    return `${callStatus.videoRoomUrl}${separator}${params}`;
  }, [callStatus?.videoRoomUrl, callMode, currentStatus, tokenData?.token]);

  const handleEndCall = async () => {
    if (endPending) return;
    setEndPending(true);
    setEndError(null);
    try {
      if (currentStatus === "ringing") {
        const action = callStatus?.isCaller ? "cancel" : "decline";
        const response = await apiFetch(`/api/call/${action}/${bookingId}`, {
          method: "POST",
          body: JSON.stringify({ sessionGeneration: generation || callStatus?.sessionGeneration }),
        });
        if (!response.ok) throw new Error("Could not cancel the call. Please try again.");
      } else if (currentStatus === "accepted") {
        const response = await apiFetch(`/api/call/end/${bookingId}`, {
          method: "POST",
          body: JSON.stringify({ sessionGeneration: generation || callStatus?.sessionGeneration }),
        });
        if (!response.ok) throw new Error("Could not end the call. Please try again.");
      }
      router.back();
    } catch (error) {
      setEndError(error instanceof Error ? error.message : "Could not end the call.");
    } finally {
      setEndPending(false);
    }
  };

  if (isLoading || statusLoading || (currentStatus === "accepted" && !!callStatus?.videoRoomUrl && !roomUrl && !tokenError && !statusError) ||
      (currentStatus === "accepted" && Platform.OS === "android" && !permissionsReady && !permissionDenied)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (currentStatus === "accepted" && Platform.OS !== "web" && permissionDenied) {
    return (
      <View style={[styles.permissionScreen, { backgroundColor: colors.background }]}>
        <Ionicons
          name={callMode === "voice" ? "mic-off-outline" : "videocam-off-outline"}
          size={48}
          color={colors.primary}
        />
        <Text style={[styles.permissionTitle, { color: colors.foreground }]}>
          {callMode === "voice" ? "Microphone access is required" : "Camera and microphone access are required"}
        </Text>
        <Text style={[styles.permissionText, { color: colors.mutedForeground }]}>
          Allow access in device settings to continue this consultation in the app.
        </Text>
        <Pressable
          onPress={() => Linking.openSettings()}
          style={[styles.settingsButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.settingsButtonText}>Open Settings</Text>
        </Pressable>
        <Pressable onPress={handleEndCall} disabled={endPending} style={styles.endBtn}>
          <Text style={[styles.endBtnText, { color: colors.destructive }]}>Leave</Text>
        </Pressable>
        {endError && <Text style={[styles.permissionText, { color: colors.destructive }]} accessibilityRole="alert">{endError}</Text>}
      </View>
    );
  }

  if (currentStatus === "accepted" && roomUrl) {
    return (
      <View style={styles.roomContainer}>
        <CallMedia key={roomAttempt} url={roomUrl} onError={() => setRoomError(true)} />
        <View style={[styles.roomHeader, { top: insets.top + 8 }]}>
          <Pressable
            onPress={handleEndCall}
            disabled={endPending}
            style={[styles.leaveRoomButton, { backgroundColor: colors.destructive }]}
            accessibilityLabel="End call"
            testID="leave-in-app-call"
          >
            <Ionicons name="call" size={22} color={colors.callForeground} style={{ transform: [{ rotate: "135deg" }] }} />
          </Pressable>
          {endError && <Text style={[styles.roomErrorText, { color: colors.callForeground }]} accessibilityRole="alert">{endError}</Text>}
        </View>
        {roomError && (
          <View style={styles.roomError}>
            <Text style={styles.roomErrorText}>The secure call could not be loaded.</Text>
            <Pressable onPress={() => { setRoomError(false); setRoomAttempt((n) => n + 1); }}>
              <Text style={[styles.retryText, { color: colors.primary }]}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.callBackground,
          paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 16,
          paddingBottom:
            Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 32,
        },
      ]}
    >
      <View style={styles.topBar}>
        <Pressable onPress={handleEndCall} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.callForeground} />
        </Pressable>
        <Text style={styles.topTitle}>
          {callTitle}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        <View
          style={[
            styles.avatarArea,
            { backgroundColor: `${colors.conversationPrimary}18` },
          ]}
        >
          <Ionicons name={callMode === "voice" ? "call-outline" : "videocam-outline"} size={58} color={colors.conversationPrimary} />
        </View>
        <Text style={[styles.consultTitle, { color: colors.callForeground }]}>
          {callTitle}
        </Text>
        {booking?.patientName && (
          <Text style={styles.patientName}>{booking.patientName}</Text>
        )}
        <Text style={[styles.hint, { color: colors.callForeground }]}>
          {currentStatus === "ringing"
            ? callStatus?.isCaller ? `Calling… Waiting for the other participant to answer` : "Incoming call…"
            : statusError || tokenError ? "Unable to connect to the secure call. Please try again."
            : currentStatus === "declined" ? "The call was declined."
            : currentStatus === "timeout" ? "No answer. The call timed out."
            : currentStatus === "none" ? "There is no active call. Start a new call from the consultation."
            : "The call has ended."}
        </Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={handleEndCall}
          disabled={endPending}
          style={({ pressed }) => [
            styles.endBtn,
            { opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Ionicons name={currentStatus === "ringing" ? "call" : "arrow-back"} size={22} color={colors.callForeground} style={currentStatus === "ringing" ? { transform: [{ rotate: "135deg" }] } : undefined} />
          <Text style={[styles.endBtnText, { color: colors.callForeground }]}>{currentStatus === "ringing" ? "Cancel call" : "Back to consultation"}</Text>
        </Pressable>
        {endError && <Text style={[styles.roomErrorText, { color: colors.callForeground }]} accessibilityRole="alert">{endError}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  roomContainer: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  webView: {
    flex: 1,
    backgroundColor: "#0A0A0A",
  },
  roomHeader: {
    position: "absolute",
    left: 12,
  },
  leaveRoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,10,0.72)",
  },
  roomError: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
    backgroundColor: "#0A0A0A",
  },
  roomErrorText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    textAlign: "center",
  },
  retryText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  permissionScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 28,
  },
  permissionTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  permissionText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  settingsButton: {
    minHeight: 50,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  settingsButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
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
