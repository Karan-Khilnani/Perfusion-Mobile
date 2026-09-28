import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";
import { BrandMark } from "@/components/BrandMark";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";

export default function LoginScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleAccount, setGoogleAccount] = useState(false);

  const routeAfterLogin = (authenticatedUser: {
    needsProfile: boolean;
    approvalStatus?: string;
  }) => {
    if (authenticatedUser.needsProfile) {
      router.replace("/complete-profile");
    } else if (
      authenticatedUser.approvalStatus === "pending" ||
      authenticatedUser.approvalStatus === "rejected"
    ) {
      router.replace("/account-status");
    } else {
      router.replace("/(tabs)");
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    setGoogleAccount(false);
    try {
      const authenticatedUser = await login(email.trim(), password);
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      routeAfterLogin(authenticatedUser);
    } catch (e: any) {
      const message = e?.message || "Login failed. Please try again.";
      setError(message);
      setGoogleAccount(message.toLowerCase().includes("google"));
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError(null);
    setGoogleAccount(false);
    try {
      const authenticatedUser = await loginWithGoogle();
      if (!authenticatedUser) return;
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      routeAfterLogin(authenticatedUser);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Google sign-in failed. Please try again.",
      );
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop:
            Platform.OS === "web" ? 67 + insets.top : insets.top + 40,
          paddingBottom:
            Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 24,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
        <View style={styles.header}>
          <BrandMark large />
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Healthcare Platform
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Sign in
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Access your healthcare dashboard
          </Text>

          <Pressable
            onPress={handleGoogleLogin}
            disabled={googleLoading || loading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
            style={({ pressed }) => [
              styles.googleButton,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
                opacity: pressed || googleLoading ? 0.75 : 1,
              },
            ]}
            testID="google-login-button"
          >
            {googleLoading ? (
              <ActivityIndicator color={colors.foreground} size="small" />
            ) : (
              <>
                <Text style={styles.googleMark}>G</Text>
                <Text style={[styles.googleButtonText, { color: colors.foreground }]}>
                  Sign in with Google
                </Text>
              </>
            )}
          </Pressable>

          <View style={styles.dividerRow}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>
              OR CONTINUE WITH EMAIL
            </Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          {error && (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: `${colors.destructive}12`, borderColor: `${colors.destructive}30` },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color={colors.destructive}
              />
              <Text style={[styles.errorText, { color: colors.destructive }]}>
                {error}
              </Text>
            </View>
          )}

          <View style={styles.fields}>
            <View>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Email
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="mail-outline"
                  size={18}
                  color={colors.mutedForeground}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { color: colors.foreground }]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your@email.com"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  testID="email-input"
                />
              </View>
            </View>

            <View>
              <Text style={[styles.label, { color: colors.foreground }]}>
                Password
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Ionicons
                  name="lock-closed-outline"
                  size={18}
                  color={colors.mutedForeground}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, { color: colors.foreground, flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  testID="password-input"
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showPassword ? "eye-off-outline" : "eye-outline"}
                    size={18}
                    color={colors.mutedForeground}
                  />
                </Pressable>
              </View>
            </View>
          </View>

          <Pressable
            onPress={() => router.push("/forgot-password")}
            accessibilityRole="link"
            testID="forgot-password-link"
            style={styles.forgotLinkButton}
          >
            <Text style={[styles.forgotLink, { color: colors.primary }]}>
              Forgot password?
            </Text>
          </Pressable>

          <Pressable
            onPress={handleLogin}
            disabled={loading || googleLoading}
            style={({ pressed }) => [
              styles.loginButton,
              {
                backgroundColor: loading
                  ? `${colors.primary}80`
                  : colors.primary,
                opacity: pressed ? 0.9 : 1,
              },
            ]}
            testID="login-button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </Pressable>

          {googleAccount && (
            <Pressable
              onPress={() => router.push({ pathname: "/set-password", params: { email: email.trim() } })}
              testID="set-google-password-link"
            >
              <Text style={[styles.secondaryLink, { color: colors.primary }]}>
                Set a password for this Google account
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => router.push("/register")}
            testID="register-link"
          >
            <Text style={[styles.secondaryLink, { color: colors.primary }]}>
              Create a new account
            </Text>
          </Pressable>
        </View>

        <Text style={[styles.footer, { color: colors.mutedForeground }]}>
          Perfusion — Connecting Care
        </Text>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  header: {
    alignItems: "center",
    gap: 8,
    marginBottom: 32,
  },
  logoContainer: {
    width: 76,
    height: 76,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  appName: {
    fontSize: 28,
    fontFamily: "Sora_700Bold",
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  form: {
    gap: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: "Sora_700Bold",
  },
  subtitle: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    marginTop: -12,
  },
  googleButton: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  googleMark: {
    color: "#4285F4",
    fontSize: 20,
    fontFamily: "Sora_700Bold",
  },
  googleButtonText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    flex: 1,
  },
  fields: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  eyeButton: {
    padding: 4,
  },
  loginButton: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  loginButtonText: {
    fontSize: 16,
    fontFamily: "Sora_600SemiBold",
    color: "#FFFFFF",
  },
  secondaryLink: {
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  forgotLinkButton: {
    alignSelf: "flex-end",
    marginTop: -10,
    paddingVertical: 4,
  },
  forgotLink: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  footer: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 32,
  },
});
