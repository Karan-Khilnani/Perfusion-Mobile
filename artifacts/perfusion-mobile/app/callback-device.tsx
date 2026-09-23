import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function CallbackDeviceScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    callbackDevice, callbackDeviceError, refreshCallbackDevice,
    saveCallbackDevice, logout,
  } = useAuth();
  const [deviceName, setDeviceName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (callbackDevice) {
      setDeviceName(callbackDevice.deviceName);
      setPhoneNumber(callbackDevice.phoneNumber);
    }
  }, [callbackDevice?.updatedAt]);

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
      await saveCallbackDevice(deviceName.trim(), phoneNumber.trim());
      router.replace("/(tabs)");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, {
        paddingTop: Platform.OS === "web" ? 67 + insets.top : 24,
        paddingBottom: Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 24,
      }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.icon, { backgroundColor: `${colors.primary}14` }]}>
        <Ionicons name="call-outline" size={30} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        {callbackDevice ? "Edit Callback Device" : "Set up your Callback Device"}
      </Text>
      <Text style={[styles.description, { color: colors.mutedForeground }]}>
        Enter a phone we can use to reach you if an in-app call is interrupted. This is separate from patient emergency contacts.
      </Text>
      {callbackDeviceError && !callbackDevice && (
        <View style={[styles.notice, { borderColor: colors.destructive }]}>
          <Text style={{ color: colors.destructive }}>{callbackDeviceError}</Text>
          <Pressable onPress={refreshCallbackDevice} testID="retry-callback-device">
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
          </Pressable>
        </View>
      )}
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
      {!!error && <Text style={{ color: colors.destructive }}>{error}</Text>}
      <Pressable
        onPress={save}
        disabled={saving || !!(callbackDeviceError && !callbackDevice)}
        style={[styles.button, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
        testID="save-callback-device"
      >
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Callback Device</Text>}
      </Pressable>
      {!callbackDevice && (
        <Pressable onPress={logout} style={styles.signOut} testID="callback-device-sign-out">
          <Text style={{ color: colors.mutedForeground }}>Sign out</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, gap: 12, flexGrow: 1 },
  icon: { width: 64, height: 64, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 25, fontFamily: "Sora_700Bold", marginTop: 8 },
  description: { fontSize: 15, lineHeight: 23, fontFamily: "Inter_400Regular", marginBottom: 12 },
  notice: { padding: 14, borderWidth: 1, borderRadius: 10, gap: 10 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginTop: 8 },
  input: { height: 50, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  button: { marginTop: 20, height: 52, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Sora_600SemiBold" },
  signOut: { alignItems: "center", padding: 16 },
});