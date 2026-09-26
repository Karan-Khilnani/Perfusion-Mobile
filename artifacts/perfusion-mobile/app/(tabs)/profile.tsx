import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { BrandMark } from "@/components/BrandMark";
import { ScreenHeading } from "@/components/ScreenHeading";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

type ProviderConsultant = {
  id: string;
  name?: string;
  displayName?: string;
  status?: "active" | "paused" | "deleted" | string;
};

function ProfileRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: any;
  label: string;
  value?: string;
  colors: any;
}) {
  if (!value) return null;
  return (
    <View
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <Ionicons name={icon} size={18} color={colors.mutedForeground} />
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <Text
          style={[styles.rowValue, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, callbackDevice } = useAuth();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const providerConsultants = useQuery<ProviderConsultant[]>({
    queryKey: ["mobile-provider-consultants", user?.id],
    enabled: user?.role === "provider",
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await apiFetch("/api/provider/my-consultants");
      if (!response.ok) throw new Error("Unable to load provider availability.");
      return response.json();
    },
  });
  const availabilityMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" }) => {
      const response = await apiFetch(`/api/provider/consultants/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Unable to update availability.");
      return data as ProviderConsultant;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile-provider-consultants", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-consultants"] }),
      ]);
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-provider-consultants", user?.id] });
    },
  });
  useFocusEffect(
    React.useCallback(() => {
      if (user?.role === "provider") void providerConsultants.refetch();
    }, [providerConsultants.refetch, user?.role]),
  );

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout();
      return;
    }
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          try {
            await logout();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const roleLabel = () => {
    if (!user?.role) return "User";
    if (user.role === "admin") return "Administrator";
    if (user.role === "provider") return "Healthcare Provider";
    return "Care Seeker";
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 20,
          paddingBottom:
            Platform.OS === "web" ? 84 + 34 : insets.bottom + 80,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.brandRow}><BrandMark compact /></View>
      <ScreenHeading title="Profile" subtitle="Account and hospital details" />
      <View style={styles.avatarSection}>
        <View
          style={[
            styles.avatarLarge,
            { backgroundColor: `${colors.primary}15` },
          ]}
        >
          <Text style={[styles.avatarInitial, { color: colors.primary }]}>
            {(user?.name || user?.email || "U")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.userName, { color: colors.foreground }]}>
          {user?.name || user?.email || "User"}
        </Text>
        <View
          style={[
            styles.rolePill,
            { backgroundColor: `${colors.primary}12`, borderColor: `${colors.primary}25` },
          ]}
        >
          <Text style={[styles.roleText, { color: colors.primary }]}>
            {roleLabel()}
          </Text>
        </View>
        {!user?.approved && (
          <View
            style={[
              styles.pendingBadge,
              { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}25` },
            ]}
          >
            <Ionicons name="time-outline" size={14} color={colors.warning} />
            <Text style={[styles.pendingText, { color: colors.warning }]}>
              Pending approval
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Account Details
        </Text>
        <ProfileRow
          icon="mail-outline"
          label="Email"
          value={user?.email}
          colors={colors}
        />
        <ProfileRow
          icon="person-outline"
          label="Name"
          value={user?.name}
          colors={colors}
        />
        <ProfileRow
          icon="business-outline"
          label="Hospital"
          value={[user?.hospitalName, user?.hospitalAddress || user?.location || user?.city].filter(Boolean).join(" · ")}
          colors={colors}
        />
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color={colors.mutedForeground}
          />
          <View style={styles.rowContent}>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
              Status
            </Text>
            <Text
              style={[
                styles.rowValue,
                {
                  color: user?.approved ? colors.success : colors.warning,
                },
              ]}
            >
              {user?.approved ? "Approved" : "Pending Approval"}
            </Text>
          </View>
        </View>
      </View>

      {user?.role === "provider" && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Availability
          </Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground, marginBottom: 12 }]}>
            Choose whether seekers can book your consultant profile.
          </Text>
          {providerConsultants.isLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.mutedForeground }}>Loading availability…</Text>
            </View>
          ) : providerConsultants.isError ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.destructive }}>
                {providerConsultants.error instanceof Error
                  ? providerConsultants.error.message
                  : "Unable to load availability."}
              </Text>
              <Pressable onPress={() => providerConsultants.refetch()} accessibilityRole="button">
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Try again</Text>
              </Pressable>
            </View>
          ) : providerConsultants.data?.length ? (
            <View>
              {providerConsultants.data.map((consultant, index) => {
                const canToggle = consultant.status === "active" || consultant.status === "paused";
                const isAvailable = consultant.status === "active";
                const updating = availabilityMutation.isPending
                  && availabilityMutation.variables?.id === consultant.id;
                return (
                  <View
                    key={consultant.id}
                    style={[
                      styles.row,
                      {
                        borderBottomColor: colors.border,
                        borderBottomWidth: index === providerConsultants.data!.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        paddingVertical: 13,
                      },
                    ]}
                  >
                    <View style={[styles.rowContent, { paddingRight: 10 }]}>
                      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                        {consultant.displayName || consultant.name || "Consultant"}
                      </Text>
                      <Text
                        style={[
                          styles.rowValue,
                          { color: canToggle ? (isAvailable ? colors.success : colors.mutedForeground) : colors.warning },
                        ]}
                      >
                        {consultant.status === "active"
                          ? "Available"
                          : consultant.status === "paused"
                            ? "Unavailable"
                            : "Status unavailable"}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {updating && <ActivityIndicator size="small" color={colors.primary} />}
                      <Switch
                        value={isAvailable}
                        disabled={!canToggle || availabilityMutation.isPending}
                        onValueChange={(available) => {
                          availabilityMutation.reset();
                          availabilityMutation.mutate({
                            id: consultant.id,
                            status: available ? "active" : "paused",
                          });
                        }}
                        trackColor={{ false: colors.border, true: `${colors.success}99` }}
                        thumbColor={isAvailable ? colors.success : colors.mutedForeground}
                        accessibilityRole="switch"
                        accessibilityLabel={`Availability for ${consultant.displayName || consultant.name || "consultant"}`}
                        accessibilityState={{ checked: isAvailable, disabled: !canToggle || availabilityMutation.isPending }}
                      />
                    </View>
                  </View>
                );
              })}
              {availabilityMutation.isError && (
                <Text style={{ color: colors.destructive, marginTop: 10 }}>
                  {availabilityMutation.error instanceof Error
                    ? availabilityMutation.error.message
                    : "Unable to update availability. The saved state was restored."}
                </Text>
              )}
            </View>
          ) : (
            <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
              No consultant profile is connected to this provider account yet.
            </Text>
          )}
        </View>
      )}

      {user?.role !== "admin" && (
        <Pressable
          onPress={() => router.push("/callback-device")}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}
          testID="edit-callback-device"
        >
          <Text style={[styles.cardTitle, { color: colors.foreground, padding: 0 }]}>Callback Device  ›</Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground, marginTop: 6 }]}>
            {callbackDevice ? `${callbackDevice.deviceName} · ${callbackDevice.phoneNumber}` : "Set up your callback number"}
          </Text>
        </Pressable>
      )}

      <Pressable
        onPress={handleLogout}
        disabled={loggingOut}
        style={({ pressed }) => [
          styles.logoutButton,
          {
            backgroundColor: `${colors.destructive}10`,
            borderColor: `${colors.destructive}25`,
            opacity: pressed || loggingOut ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name="log-out-outline"
          size={20}
          color={colors.destructive}
        />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>
          {loggingOut ? "Signing out..." : "Sign Out"}
        </Text>
      </Pressable>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Perfusion Mobile v1.0
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    gap: 20,
  },
  brandRow: { alignItems: "flex-start", marginBottom: 2 },
  avatarSection: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarInitial: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  userName: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  rolePill: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  roleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  pendingText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    padding: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rowValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  version: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
