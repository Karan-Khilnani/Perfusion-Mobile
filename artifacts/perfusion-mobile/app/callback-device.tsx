import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppAlert } from "@/components/AppAlert";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { getPushDeviceId } from "@/lib/push-device";

export default function CallbackDeviceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    callbackDevices, callbackDevicesLoading, callbackDevicesError,
    refreshCallbackDevices, createCallbackDevice, updateCallbackDevice,
    deleteCallbackDevice, logout,
  } = useAuth();
  const currentInstallation = useQuery<string>({
    queryKey: ["mobile-push-device-id"],
    queryFn: getPushDeviceId,
    staleTime: Infinity,
  });
  const [deviceName, setDeviceName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onboarding = !callbackDevicesLoading && callbackDevices.length === 0;

  const save = async () => {
    setError(null);
    if (!deviceName.trim() || deviceName.trim().length > 100) {
      setError("Enter a device name (up to 100 characters).");
      return;
    }
    if (phoneNumber.replace(/\D/g, "").length < 7) {
      setError("Enter a valid callback phone number.");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateCallbackDevice(editingId, {
          deviceName: deviceName.trim(),
          phoneNumber: phoneNumber.trim(),
        });
      } else {
        await createCallbackDevice({
          deviceName: deviceName.trim(),
          phoneNumber: phoneNumber.trim(),
          installationId: currentInstallation.data || await getPushDeviceId(),
        });
      }
      setDeviceName("");
      setPhoneNumber("");
      setEditingId(null);
      if (onboarding) router.replace("/(tabs)");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const edit = (item: (typeof callbackDevices)[number]) => {
    setEditingId(item.id);
    setDeviceName(item.deviceName);
    setPhoneNumber(item.phoneNumber);
    setError(null);
  };

  const remove = (item: (typeof callbackDevices)[number]) => AppAlert.alert(
    "Remove callback device",
    `Remove ${item.deviceName} from your directory? Existing Case File assignments will keep their saved label.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          setSaving(true);
          void deleteCallbackDevice(item.id)
            .then(() => {
              if (editingId === item.id) {
                setEditingId(null);
                setDeviceName("");
                setPhoneNumber("");
              }
            })
            .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not remove this device."))
            .finally(() => setSaving(false));
        },
      },
    ],
  );

  const linkCurrentInstallation = async (id: string, linked: boolean) => {
    setSaving(true);
    setError(null);
    try {
      await updateCallbackDevice(id, { installationId: linked ? null : await getPushDeviceId() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not link this installation.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, {
        paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 20,
        paddingBottom: Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 24,
      }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.icon, { backgroundColor: `${colors.primary}14` }]}>
        <Feather name="phone-call" size={27} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {onboarding ? "Set up callback device" : "Callback devices"}
      </Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Register the phones you can answer if an in-app consultation call is interrupted. Each consultation uses its own chosen device; this directory does not set a global active number.
      </Text>

      {callbackDevicesLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>Loading your device directory…</Text></View>
      ) : null}
      {!!callbackDevicesError && (
        <View style={[styles.notice, { borderColor: colors.destructive }]}>
          <Text style={{ color: colors.destructive }}>{callbackDevicesError}</Text>
          <Pressable onPress={() => void refreshCallbackDevices()} testID="retry-callback-devices">
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
          </Pressable>
        </View>
      )}

      {callbackDevices.map((device) => {
        const linked = !!device.installationId && device.installationId === currentInstallation.data;
        return (
          <View key={device.id} style={[styles.deviceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.deviceInfo}>
              <Text style={[styles.deviceName, { color: colors.foreground }]}>{device.deviceName}</Text>
              <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>{device.phoneNumber}</Text>
              <Text style={[styles.deviceMeta, { color: linked ? colors.success : colors.mutedForeground }]}>
                {linked ? "Linked to this installation" : "Not linked to this installation"}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable onPress={() => edit(device)} accessibilityLabel={`Edit ${device.deviceName}`} hitSlop={8}>
                <Feather name="edit-2" size={17} color={colors.primary} />
              </Pressable>
              <Pressable disabled={saving || !currentInstallation.data} onPress={() => void linkCurrentInstallation(device.id, linked)} accessibilityLabel={linked ? "Unlink this installation" : "Link this installation"} hitSlop={8}>
                <Feather name={linked ? "smartphone" : "link"} size={17} color={linked ? colors.success : colors.primary} />
              </Pressable>
              <Pressable disabled={saving} onPress={() => remove(device)} accessibilityLabel={`Remove ${device.deviceName}`} hitSlop={8}>
                <Feather name="trash-2" size={17} color={colors.destructive} />
              </Pressable>
            </View>
          </View>
        );
      })}

      {!callbackDevicesLoading && !callbackDevicesError && callbackDevices.length === 0 && !onboarding && (
        <Text style={{ color: colors.mutedForeground }}>No devices registered yet. Add at least one phone to continue.</Text>
      )}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{editingId ? "Edit device" : callbackDevices.length ? "Add another device" : "Your current device"}</Text>
      <Text style={[styles.label, { color: colors.foreground }]}>Device name</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
        placeholder="e.g. My mobile"
        placeholderTextColor={colors.mutedForeground}
        value={deviceName}
        onChangeText={setDeviceName}
        maxLength={100}
        testID="callback-device-name"
      />
      <Text style={[styles.label, { color: colors.foreground }]}>Callback phone number</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
        placeholder="+91 98765 43210"
        placeholderTextColor={colors.mutedForeground}
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        keyboardType="phone-pad"
        autoComplete="tel"
        maxLength={25}
        testID="callback-phone-number"
      />
      {!!error && <Text style={{ color: colors.destructive }} accessibilityRole="alert">{error}</Text>}
      <Pressable
        onPress={() => void save()}
        disabled={saving || callbackDevicesLoading || !!callbackDevicesError}
        style={[styles.button, { backgroundColor: colors.primary, opacity: saving || callbackDevicesLoading || !!callbackDevicesError ? 0.6 : 1 }]}
        testID="save-callback-device"
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{editingId ? "Save device" : "Register device"}</Text>}
      </Pressable>
      {editingId && (
        <Pressable onPress={() => { setEditingId(null); setDeviceName(""); setPhoneNumber(""); setError(null); }} style={styles.cancel}>
          <Text style={{ color: colors.mutedForeground }}>Cancel editing</Text>
        </Pressable>
      )}
      {onboarding && (
        <Pressable onPress={() => void logout()} style={styles.cancel} testID="callback-device-sign-out">
          <Text style={{ color: colors.mutedForeground }}>Sign out</Text>
        </Pressable>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, gap: 12, flexGrow: 1 },
  icon: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 25, fontFamily: "Sora_700Bold", marginTop: 8 },
  description: { fontSize: 15, lineHeight: 23, fontFamily: "Inter_400Regular", marginBottom: 8 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  notice: { padding: 14, borderWidth: 1, borderRadius: 10, gap: 10 },
  deviceCard: { borderWidth: 1, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 14 },
  deviceInfo: { flex: 1, gap: 4 },
  deviceName: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  deviceMeta: { fontFamily: "Inter_400Regular", fontSize: 12 },
  actions: { flexDirection: "row", alignItems: "center", gap: 15 },
  sectionTitle: { fontSize: 17, fontFamily: "Sora_600SemiBold", marginTop: 12 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 4 },
  input: { height: 50, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  button: { marginTop: 12, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Sora_600SemiBold" },
  cancel: { alignItems: "center", padding: 12 },
});