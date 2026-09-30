import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
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
    user,
    callbackDevices, callbackDevicesLoading, callbackDevicesError,
    refreshCallbackDevices, createCallbackDevice, updateCallbackDevice,
    deleteCallbackDevice, logout,
  } = useAuth();
  const currentInstallation = useQuery<string>({
    queryKey: ["mobile-push-device-id"],
    queryFn: getPushDeviceId,
    enabled: user?.role === "care_seeker" && user.approvalStatus === "approved" && !user.needsProfile,
    staleTime: Infinity,
  });
  const [staffName, setStaffName] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const linkedCurrentDevice = callbackDevices.find(
    (device) =>
      !!currentInstallation.data &&
      device.installationId === currentInstallation.data &&
      !!device.staffName?.trim(),
  );
  const onboarding = !linkedCurrentDevice;

  const save = async () => {
    setError(null);
    if (!staffName.trim() || staffName.trim().length > 100) {
      setError("Enter the staff member's name (up to 100 characters).");
      return;
    }
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
      const installationId = currentInstallation.data;
      if (!installationId) {
        throw new Error("This installation could not be identified. Please try again.");
      }
      let saved;
      if (editingId) {
        const editingDevice = callbackDevices.find((device) => device.id === editingId);
        if (onboarding && editingDevice?.installationId && editingDevice.installationId !== installationId) {
          throw new Error("This registration belongs to another installation. Use its Link button to move it here.");
        }
        saved = await updateCallbackDevice(editingId, {
          staffName: staffName.trim(),
          deviceName: deviceName.trim(),
          phoneNumber: phoneNumber.trim(),
          ...(onboarding && !editingDevice?.installationId ? { installationId } : {}),
        });
      } else {
        saved = await createCallbackDevice({
          staffName: staffName.trim(),
          deviceName: deviceName.trim(),
          phoneNumber: phoneNumber.trim(),
          installationId,
        });
      }
      if (
        onboarding &&
        (saved.installationId !== installationId || !saved.staffName?.trim())
      ) {
        throw new Error("The callback device was saved, but it is not linked to this installation. Please link it to continue.");
      }
      setStaffName("");
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
    setStaffName(item.staffName || "");
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
                setStaffName("");
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
      const saved = await updateCallbackDevice(id, { installationId: linked ? null : await getPushDeviceId() });
      if (onboarding && saved.installationId === currentInstallation.data && saved.staffName?.trim()) {
        router.replace("/(tabs)");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not link this installation.");
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <Redirect href="/login" />;
  if (user.role !== "care_seeker") return <Redirect href="/(tabs)" />;
  if (user.needsProfile) return <Redirect href="/complete-profile" />;
  if (user.approvalStatus !== "approved") return <Redirect href="/account-status" />;

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
        {onboarding
          ? "Register who is using this installation. The device will be assigned to individual bookings; its contact number is saved for a future pre-appointment reminder."
          : "Each consultation chooses its own staff member and device. The contact number is saved for a future pre-appointment reminder, not for in-app calling."}
      </Text>

      {currentInstallation.isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>Identifying this installation…</Text></View>
      ) : null}
      {currentInstallation.isError && (
        <View style={[styles.notice, { borderColor: colors.destructive }]}>
          <Text style={{ color: colors.destructive }}>Could not identify this installation. Callback setup cannot continue until its identity is available.</Text>
          <Pressable onPress={() => void currentInstallation.refetch()} testID="retry-installation-id">
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
          </Pressable>
        </View>
      )}

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
              {!!device.staffName && <Text style={[styles.deviceMeta, { color: colors.mutedForeground }]}>{device.staffName}</Text>}
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
              <Pressable
                disabled={saving || !currentInstallation.data}
                onPress={() => {
                  if (!linked && device.installationId) {
                    AppAlert.alert(
                      "Move registration to this installation?",
                      "This stops the old installation from using this registration. Bookings assigned to it will need to use this installation when targeted calling is enabled.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Move registration", onPress: () => void linkCurrentInstallation(device.id, false) },
                      ],
                    );
                  } else {
                    void linkCurrentInstallation(device.id, linked);
                  }
                }}
                accessibilityLabel={linked ? "Unlink this installation" : "Link this installation"}
                hitSlop={8}
              >
                <Feather name={linked ? "smartphone" : "link"} size={17} color={linked ? colors.success : colors.primary} />
              </Pressable>
              <Pressable disabled={saving} onPress={() => remove(device)} accessibilityLabel={`Remove ${device.deviceName}`} hitSlop={8}>
                <Feather name="trash-2" size={17} color={colors.destructive} />
              </Pressable>
            </View>
          </View>
        );
      })}

      {!callbackDevicesLoading && !callbackDevicesError && callbackDevices.length === 0 && (
        <Text style={{ color: colors.mutedForeground }}>No devices registered yet. Add at least one phone to continue.</Text>
      )}

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{editingId ? "Edit callback registration" : onboarding ? "This installation" : "Add another device"}</Text>
      <Text style={[styles.label, { color: colors.foreground }]}>Staff member</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, color: colors.foreground, borderColor: colors.border }]}
        placeholder="Name of the staff member using this phone"
        placeholderTextColor={colors.mutedForeground}
        value={staffName}
        onChangeText={setStaffName}
        maxLength={100}
        autoComplete="name"
        testID="callback-staff-name"
      />
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
        disabled={saving || callbackDevicesLoading || !!callbackDevicesError || !currentInstallation.data}
        style={[styles.button, { backgroundColor: colors.primary, opacity: saving || callbackDevicesLoading || !!callbackDevicesError || !currentInstallation.data ? 0.6 : 1 }]}
        testID="save-callback-device"
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{editingId ? "Save registration" : "Register this installation"}</Text>}
      </Pressable>
      {editingId && (
        <Pressable onPress={() => { setEditingId(null); setStaffName(""); setDeviceName(""); setPhoneNumber(""); setError(null); }} style={styles.cancel}>
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