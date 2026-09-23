import { router } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function VerifyEmailScreen() {
  const colors = useColors();
  const { verifyEmail, resendVerification } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const verify = async () => {
    setLoading(true);
    setError(null);
    try {
      await verifyEmail(code.trim());
      router.replace("/(tabs)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setLoading(true);
    setError(null);
    try {
      await resendVerification();
      setMessage("A new verification code was sent.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not resend the code.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.foreground }]}>Verify your email</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Enter the 6-digit code sent to your email address.</Text>
      {message && <Text style={[styles.message, { color: colors.primary }]}>{message}</Text>}
      {error && <Text style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      <TextInput style={[styles.input, { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.border }]} value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} placeholder="123456" placeholderTextColor={colors.mutedForeground} />
      <Pressable onPress={verify} disabled={loading} style={[styles.button, { backgroundColor: colors.primary }]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Verify email</Text>}
      </Pressable>
      <Pressable onPress={resend} disabled={loading}>
        <Text style={[styles.link, { color: colors.primary }]}>Resend code</Text>
      </Pressable>
      <Pressable onPress={() => router.replace("/login")}>
        <Text style={[styles.link, { color: colors.mutedForeground }]}>Back to sign in</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: "center", gap: 16 },
  title: { fontSize: 26, fontFamily: "Sora_700Bold" },
  subtitle: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 22 },
  input: { height: 50, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 18, letterSpacing: 4 },
  button: { height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  buttonText: { color: "#fff", fontSize: 16, fontFamily: "Sora_600SemiBold" },
  link: { textAlign: "center", fontSize: 14, fontFamily: "Inter_500Medium" },
  message: { fontSize: 14, fontFamily: "Inter_400Regular" },
  error: { fontSize: 14, fontFamily: "Inter_400Regular" },
});