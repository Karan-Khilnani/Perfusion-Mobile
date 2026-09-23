import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getBaseUrl } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

export default function SetPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(typeof params.email === "string" ? params.email : "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [requested, setRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${getBaseUrl()}/api/auth/google-password/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mobile-Client": "1" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not send the verification code.");
      setRequested(true);
      setMessage(data.message || "Check your email for the verification code.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the verification code.");
    } finally {
      setLoading(false);
    }
  };

  const complete = async () => {
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit verification code.");
      return;
    }
    if (password.length < 6 || password !== confirmPassword) {
      setError(password.length < 6 ? "Password must be at least 6 characters." : "Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/api/auth/google-password/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mobile-Client": "1" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Could not create the password.");
      router.replace({ pathname: "/login", params: { email: email.trim().toLowerCase() } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 32, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={20} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>Back to sign in</Text>
        </Pressable>
        <Text style={[styles.title, { color: colors.foreground }]}>Set a password</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Use your Google account email to create an email/password login.</Text>

        {message && <Text style={[styles.message, { color: colors.primary }]}>{message}</Text>}
        {error && <Text style={[styles.errorText, { color: colors.destructive }]}>{error}</Text>}

        <Text style={[styles.label, { color: colors.foreground }]}>Email</Text>
        <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="you@email.com" placeholderTextColor={colors.mutedForeground} />

        {!requested ? (
          <Pressable onPress={requestCode} disabled={loading} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send verification code</Text>}
          </Pressable>
        ) : (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>Verification code</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="123456" placeholderTextColor={colors.mutedForeground} />
            <Text style={[styles.label, { color: colors.foreground }]}>New password</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} value={password} onChangeText={setPassword} secureTextEntry placeholder="At least 6 characters" placeholderTextColor={colors.mutedForeground} />
            <Text style={[styles.label, { color: colors.foreground }]}>Confirm password</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Repeat password" placeholderTextColor={colors.mutedForeground} />
            <Pressable onPress={complete} disabled={loading} style={[styles.primaryButton, { backgroundColor: colors.primary }]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Create password</Text>}
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, gap: 14 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  backText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  title: { fontSize: 26, fontFamily: "Sora_700Bold" },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22, marginBottom: 6 },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", marginTop: 4 },
  input: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  primaryButton: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontFamily: "Sora_600SemiBold" },
  message: { fontSize: 14, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});