import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCall } from "@/contexts/CallContext";
import { useColors } from "@/hooks/useColors";

export function IncomingCallOverlay() {
  const { incomingCall, acceptCall, declineCall } = useCall();
  const ringtone = useAudioPlayer(require("../assets/audio/perfusion_ring.wav"));
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [responding, setResponding] = useState(false);

  useEffect(() => {
    if (!incomingCall) return;
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.12,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    // This overlay is only shown when the native call UI cannot be reported.
    // Native calls play through the Android incoming-call notification channel.
    ringtone.loop = true;
    ringtone.play();
    return () => {
      pulse.stop();
      ringtone.pause();
      ringtone.seekTo(0).catch(() => {});
    };
  }, [incomingCall?.bookingId, incomingCall?.sessionGeneration, pulseAnim, ringtone]);

  if (!incomingCall) return null;

  const handleAccept = async () => {
    if (responding) return;
    setResponding(true);
    ringtone.pause();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    try {
      await acceptCall(incomingCall.bookingId);
      router.push(`/call/${incomingCall.bookingId}?mode=${incomingCall.callType === "voice" ? "voice" : "video"}&generation=${incomingCall.sessionGeneration || ""}`);
    } catch (error) {
      ringtone.play();
      Alert.alert(
        "Could not accept call",
        error instanceof Error ? error.message : "Please check your connection and try again.",
      );
    } finally {
      setResponding(false);
    }
  };

  const handleDecline = async () => {
    if (responding) return;
    setResponding(true);
    ringtone.pause();
    if (Platform.OS !== "web") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    try {
      await declineCall(incomingCall.bookingId);
    } catch (error) {
      ringtone.play();
      Alert.alert(
        "Could not decline call",
        error instanceof Error ? error.message : "Please check your connection and try again.",
      );
    } finally {
      setResponding(false);
    }
  };

  return (
    <View
      style={[
        styles.overlay,
        {
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={styles.topSection}>
          <Text style={styles.incomingLabel}>Incoming {incomingCall.callType === "voice" ? "Voice" : "Video"} Call</Text>
          <Animated.View
            style={[
              styles.avatarRing,
              { borderColor: `${colors.primary}40`, transform: [{ scale: pulseAnim }] },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Ionicons name="medical" size={40} color="#fff" />
            </View>
          </Animated.View>
          <Text style={styles.callerName}>{incomingCall.callerName}</Text>
          {incomingCall.subtitle && (
            <Text style={styles.subtitle}>{incomingCall.subtitle}</Text>
          )}
          {incomingCall.serviceName && incomingCall.callerRole !== "seeker" && (
            <View style={styles.servicePill}>
              <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.7)" />
              <Text style={styles.servicePillText}>
                {incomingCall.serviceName}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <View style={styles.actionItem}>
            <Pressable
              onPress={handleDecline}
              disabled={responding}
              style={({ pressed }) => [
                styles.actionButton,
                styles.declineButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: "135deg" }] }} />
            </Pressable>
            <Text style={styles.actionLabel}>Decline</Text>
          </View>

          <View style={styles.actionItem}>
            <Pressable
              onPress={handleAccept}
              disabled={responding}
              style={({ pressed }) => [
                styles.actionButton,
                styles.acceptButton,
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Ionicons name={incomingCall.callType === "voice" ? "call" : "videocam"} size={28} color="#fff" />
            </Pressable>
            <Text style={styles.actionLabel}>Accept</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0F0F0F",
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    width: "100%",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
  },
  topSection: {
    alignItems: "center",
    gap: 12,
    marginTop: 40,
  },
  incomingLabel: {
    fontSize: 15,
    color: "rgba(255,255,255,0.6)",
    fontFamily: "Inter_400Regular",
    letterSpacing: 0.5,
  },
  avatarRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 8,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  callerName: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  servicePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 4,
  },
  servicePillText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 64,
    marginBottom: 32,
    width: "100%",
  },
  actionItem: {
    alignItems: "center",
    gap: 10,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  declineButton: {
    backgroundColor: "#EF4444",
  },
  acceptButton: {
    backgroundColor: "#16A34A",
  },
  actionLabel: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
    fontFamily: "Inter_500Medium",
  },
});
