import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
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
import { WebView } from "react-native-webview";

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
  const { bookingId, mode } = useLocalSearchParams<{
    bookingId: string;
    mode?: "voice" | "video";
  }>();
  const callMode = mode === "voice" ? "voice" : "video";
  const [permissionsReady, setPermissionsReady] = useState(Platform.OS !== "android");
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [roomError, setRoomError] = useState(false);

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

  useEffect(() => {
    if (Platform.OS !== "android") return;

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
  }, [callMode]);

  const roomUrl = useMemo(() => {
    if (!booking?.videoRoomId || !tokenData?.token) return null;
    const separator = booking.videoRoomId.includes("?") ? "&" : "?";
    const params = [
      `t=${encodeURIComponent(tokenData.token)}`,
      "prejoinUI=false",
      callMode === "voice" ? "startVideoOff=true" : null,
    ]
      .filter(Boolean)
      .join("&");
    return `${booking.videoRoomId}${separator}${params}`;
  }, [booking?.videoRoomId, callMode, tokenData?.token]);

  const handleOpenRoom = async () => {
    if (!roomUrl) return;
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await WebBrowser.openBrowserAsync(roomUrl, {
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

  if (isLoading || !roomUrl || (Platform.OS === "android" && !permissionsReady && !permissionDenied)) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (Platform.OS !== "web" && permissionDenied) {
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
          Allow access in device settings to join this consultation in the app.
        </Text>
        <Pressable
          onPress={() => Linking.openSettings()}
          style={[styles.settingsButton, { backgroundColor: colors.primary }]}
        >
          <Text style={styles.settingsButtonText}>Open Settings</Text>
        </Pressable>
        <Pressable onPress={handleEndCall} style={styles.endBtn}>
          <Text style={[styles.endBtnText, { color: colors.destructive }]}>Leave</Text>
        </Pressable>
      </View>
    );
  }

  if (Platform.OS !== "web") {
    return (
      <View style={styles.roomContainer}>
        <WebView
          source={{ uri: roomUrl }}
          style={styles.webView}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          setSupportMultipleWindows={false}
          onError={() => setRoomError(true)}
          onHttpError={() => setRoomError(true)}
          testID="in-app-call-room"
        />
        <View style={[styles.roomHeader, { top: insets.top + 8 }]}>
          <Pressable
            onPress={handleEndCall}
            style={styles.leaveRoomButton}
            accessibilityLabel="Leave consultation"
            testID="leave-in-app-call"
          >
            <Ionicons name="close" size={24} color="#FFFFFF" />
          </Pressable>
        </View>
        {roomError && (
          <View style={styles.roomError}>
            <Text style={styles.roomErrorText}>The secure call could not be loaded.</Text>
            <Pressable onPress={() => setRoomError(false)}>
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
          Tap below to join the {callMode} consultation
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
          <Ionicons name={callMode === "voice" ? "call" : "videocam"} size={22} color="#fff" />
          <Text style={styles.joinBtnText}>
            {tokenData?.token ? `Join ${callMode === "voice" ? "Voice" : "Video"} Call` : "Preparing Secure Call…"}
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
