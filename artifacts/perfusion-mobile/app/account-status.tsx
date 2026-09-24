import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function AccountStatusScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, refreshUser, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const rejected = user?.approvalStatus === "rejected";

  const checkStatus = async () => {
    setRefreshing(true);
    try {
      await refreshUser();
    } finally {
      setRefreshing(false);
    }
  };

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop:
            Platform.OS === "web" ? 67 + insets.top : insets.top + 32,
          paddingBottom:
            Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.icon,
            {
              backgroundColor: rejected
                ? `${colors.destructive}12`
                : `${colors.warning}12`,
            },
          ]}
        >
          <Ionicons
            name={rejected ? "close-circle-outline" : "time-outline"}
            size={34}
            color={rejected ? colors.destructive : colors.warning}
          />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          {rejected ? "Registration not approved" : "Approval pending"}
        </Text>
        <Text style={[styles.description, { color: colors.mutedForeground }]}>
          {rejected
            ? user?.email
              ? `The registration for ${user.email} was not approved. Contact support if you believe this is an error.`
              : "Your registration was not approved. Contact support if you believe this is an error."
            : user?.email
              ? `The registration for ${user.email} is being reviewed. You can continue after an administrator approves it.`
              : "Your registration is being reviewed. You can continue after an administrator approves it."}
        </Text>
      </View>

      <View style={styles.actions}>
        {!rejected && (
          <Pressable
            onPress={checkStatus}
            disabled={refreshing}
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            testID="refresh-approval-button"
          >
            {refreshing ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Check approval status</Text>
            )}
          </Pressable>
        )}
        <Pressable
          onPress={signOut}
          style={[styles.secondaryButton, { borderColor: colors.border }]}
          testID="status-sign-out-button"
        >
          <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>
            Sign out
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  content: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  title: { fontSize: 24, fontFamily: "Sora_700Bold", textAlign: "center" },
  description: {
    fontSize: 15,
    lineHeight: 23,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 420,
  },
  actions: { gap: 12 },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: "Sora_600SemiBold",
  },
  secondaryButton: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: { fontSize: 15, fontFamily: "Inter_500Medium" },
});