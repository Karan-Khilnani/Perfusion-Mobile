import { Ionicons } from "@expo/vector-icons";
import { useRequestPasswordReset } from "@workspace/api-client-react";
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

import { BrandMark } from "@/components/BrandMark";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth, type User } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

type RecoveryStep = "email" | "code" | "verified" | "password";

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const details = error as {
      data?: { message?: unknown };
      message?: unknown;
    };
    if (typeof details.data?.message === "string") return details.data.message;
    if (typeof details.message === "string") return details.message;
  }
  return fallback;
}

function getErrorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

export default function ForgotPasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    verifyPasswordReset,
    changePasswordAfterRecovery,
    finishPasswordReset,
  } = useAuth();
  const requestMutation = useRequestPasswordReset();

  const [step, setStep] = useState<RecoveryStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveredUser, setRecoveredUser] = useState<User | null>(null);
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);

  const requestCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address for your account.");
      setNotice(null);
      setNotRegistered(false);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    setNotRegistered(false);
    try {
      await requestMutation.mutateAsync({ data: { email: normalizedEmail } });
      setEmail(normalizedEmail);
      setCode("");
      setStep("code");
      setNotice("We sent a 6-digit code. It expires in 10 minutes.");
    } catch (cause) {
      setError(getErrorMessage(cause, "Could not send the recovery code."));
      if (getErrorStatus(cause) === 404) setNotRegistered(true);
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      setNotice(null);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const user = await verifyPasswordReset(email, code);
      setRecoveredUser(user);
      setStep("verified");
      setNotice("Your email is verified and you’re signed in.");
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (cause) {
      setError(getErrorMessage(cause, "Could not verify the code."));
      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    if (password.length < 6) {
      setError("Use at least 6 characters for your password.");
      setNotice(null);
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      setNotice(null);
      return;
    }

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await changePasswordAfterRecovery(password);
      setPasswordChanged(true);
      setPassword("");
      setConfirmPassword("");
      setStep("verified");
      setNotice("Your password has been updated.");
    } catch (cause) {
      setError(getErrorMessage(cause, "Could not update the password."));
    } finally {
      setBusy(false);
    }
  };

  const routeAfterRecovery = (user: User | null) => {
    if (!user) {
      router.replace("/login");
    } else if (user.needsProfile) {
      router.replace("/complete-profile");
    } else if (
      user.approvalStatus === "pending" ||
      user.approvalStatus === "rejected"
    ) {
      router.replace("/account-status");
    } else {
      router.replace("/(tabs)");
    }
  };

  const continueToApp = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!passwordChanged) await finishPasswordReset();
      routeAfterRecovery(recoveredUser);
    } catch (cause) {
      setError(getErrorMessage(cause, "Could not finish account recovery."));
    } finally {
      setBusy(false);
    }
  };

  const title =
    step === "email"
      ? "Recover your account"
      : step === "code"
        ? "Check your email"
        : step === "password"
          ? "Choose a new password"
          : "You’re back in";
  const description =
    step === "email"
      ? "Enter the email address linked to your Perfusion account."
      : step === "code"
        ? `Enter the 6-digit code sent to ${email}.`
        : step === "password"
          ? "Set a new password now, or continue without changing it."
          : "You can set a new password now or continue to your account.";

  const contentPadding = {
    paddingTop:
      Platform.OS === "web" ? 67 + insets.top + 16 : insets.top + 32,
    paddingBottom:
      Platform.OS === "web" ? 34 + insets.bottom + 16 : insets.bottom + 24,
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={[styles.content, contentPadding]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={72}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.top}>
        <View style={styles.brand}>
          <BrandMark large />
          <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
            Healthcare Platform
          </Text>
        </View>

        <View style={styles.form}>
          <View
            style={[
              styles.iconTile,
              { backgroundColor: colors.accent, borderRadius: colors.radius },
            ]}
          >
            <Ionicons
              name={step === "verified" ? "checkmark-circle-outline" : "lock-closed-outline"}
              size={24}
              color={step === "verified" ? colors.success : colors.primary}
            />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
          <Text style={[styles.description, { color: colors.mutedForeground }]}>
            {description}
          </Text>

          {error && (
            <View
              accessibilityRole="alert"
              style={[
                styles.messageBox,
                {
                  backgroundColor: `${colors.destructive}12`,
                  borderColor: `${colors.destructive}30`,
                },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={17}
                color={colors.destructive}
              />
              <Text style={[styles.messageText, { color: colors.destructive }]}>
                {error}
              </Text>
            </View>
          )}

          {notice && (
            <View
              style={[
                styles.messageBox,
                {
                  backgroundColor: `${colors.success}12`,
                  borderColor: `${colors.success}30`,
                },
              ]}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={17}
                color={colors.success}
              />
              <Text style={[styles.messageText, { color: colors.success }]}>
                {notice}
              </Text>
            </View>
          )}

          {step === "email" && (
            <>
              <View>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  Email
                </Text>
                <View
                  style={[
                    styles.inputWrapper,
                    { backgroundColor: colors.card, borderColor: colors.border },
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
                    onChangeText={(value) => {
                      setEmail(value);
                      setError(null);
                      setNotRegistered(false);
                    }}
                    placeholder="your@email.com"
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="email"
                    keyboardType="email-address"
                    returnKeyType="go"
                    onSubmitEditing={requestCode}
                    accessibilityLabel="Account email"
                    testID="recovery-email-input"
                  />
                </View>
              </View>
              <Pressable
                onPress={requestCode}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: busy || pressed ? 0.78 : 1,
                  },
                ]}
                testID="send-recovery-code-button"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    Send recovery code
                  </Text>
                )}
              </Pressable>
              {notRegistered && (
                <Pressable
                  onPress={() => router.push("/register")}
                  accessibilityRole="link"
                  testID="recovery-signup-link"
                  style={styles.secondaryButton}
                >
                  <Text style={[styles.linkText, { color: colors.primary }]}>
                    Create an account
                  </Text>
                </Pressable>
              )}
            </>
          )}

          {step === "code" && (
            <>
              <View>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  6-digit code
                </Text>
                <View
                  style={[
                    styles.inputWrapper,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Ionicons
                    name="keypad-outline"
                    size={18}
                    color={colors.mutedForeground}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, styles.codeInput, { color: colors.foreground }]}
                    value={code}
                    onChangeText={(value) => {
                      setCode(value.replace(/\D/g, "").slice(0, 6));
                      setError(null);
                    }}
                    placeholder="000000"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    autoComplete="one-time-code"
                    maxLength={6}
                    returnKeyType="done"
                    onSubmitEditing={verifyCode}
                    accessibilityLabel="6-digit recovery code"
                    testID="recovery-code-input"
                  />
                </View>
              </View>
              <Pressable
                onPress={verifyCode}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: busy || pressed ? 0.78 : 1,
                  },
                ]}
                testID="verify-recovery-code-button"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    Verify code
                  </Text>
                )}
              </Pressable>
              <View style={styles.inlineActions}>
                <Pressable
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                    setNotice(null);
                  }}
                  accessibilityRole="link"
                  testID="change-recovery-email-link"
                >
                  <Text style={[styles.linkText, { color: colors.primary }]}>
                    Use a different email
                  </Text>
                </Pressable>
                <Pressable
                  onPress={requestCode}
                  disabled={busy}
                  accessibilityRole="button"
                  testID="resend-recovery-code-button"
                >
                  <Text style={[styles.linkText, { color: colors.primary }]}>
                    Resend code
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {step === "verified" && (
            <>
              <Pressable
                onPress={() => {
                  setError(null);
                  setNotice(null);
                  setStep("password");
                }}
                accessibilityRole="button"
                style={styles.secondaryButton}
                testID="choose-recovery-password-button"
              >
                <Text style={[styles.linkText, { color: colors.primary }]}>
                  {passwordChanged ? "Change password again" : "Set a new password"}
                </Text>
              </Pressable>
              <Pressable
                onPress={continueToApp}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: busy || pressed ? 0.78 : 1,
                  },
                ]}
                testID="continue-after-recovery-button"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    Continue to your account
                  </Text>
                )}
              </Pressable>
            </>
          )}

          {step === "password" && (
            <>
              <View>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  New password
                </Text>
                <View
                  style={[
                    styles.inputWrapper,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={colors.mutedForeground}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={password}
                    onChangeText={(value) => {
                      setPassword(value);
                      setError(null);
                    }}
                    placeholder="At least 6 characters"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="next"
                    accessibilityLabel="New password"
                    testID="recovery-new-password-input"
                  />
                </View>
              </View>
              <View>
                <Text style={[styles.label, { color: colors.foreground }]}>
                  Confirm new password
                </Text>
                <View
                  style={[
                    styles.inputWrapper,
                    { backgroundColor: colors.card, borderColor: colors.border },
                  ]}
                >
                  <Ionicons
                    name="lock-closed-outline"
                    size={18}
                    color={colors.mutedForeground}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, { color: colors.foreground }]}
                    value={confirmPassword}
                    onChangeText={(value) => {
                      setConfirmPassword(value);
                      setError(null);
                    }}
                    placeholder="Re-enter your password"
                    placeholderTextColor={colors.mutedForeground}
                    secureTextEntry
                    autoComplete="new-password"
                    textContentType="newPassword"
                    returnKeyType="done"
                    onSubmitEditing={savePassword}
                    accessibilityLabel="Confirm new password"
                    testID="recovery-confirm-password-input"
                  />
                </View>
              </View>
              <Pressable
                onPress={savePassword}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: busy || pressed ? 0.78 : 1,
                  },
                ]}
                testID="save-recovery-password-button"
              >
                {busy ? (
                  <ActivityIndicator color={colors.primaryForeground} size="small" />
                ) : (
                  <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                    Save password
                  </Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => {
                  setStep("verified");
                  setError(null);
                }}
                accessibilityRole="link"
                testID="skip-password-change-link"
                style={styles.secondaryButton}
              >
                <Text style={[styles.linkText, { color: colors.primary }]}>
                  Skip for now
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {(step === "email" || step === "code") && (
        <Pressable
          onPress={() => router.replace("/login")}
          accessibilityRole="link"
          testID="recovery-back-to-login-link"
          style={styles.footerLink}
        >
          <Text style={[styles.footerText, { color: colors.mutedForeground }]}>
            Remembered your password?{" "}
            <Text style={[styles.linkText, { color: colors.primary }]}>
              Back to sign in
            </Text>
          </Text>
        </Pressable>
      )}
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  top: {
    gap: 32,
  },
  brand: {
    alignItems: "center",
    gap: 8,
  },
  tagline: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  form: {
    gap: 16,
  },
  iconTile: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  title: {
    fontSize: 25,
    fontFamily: "Sora_700Bold",
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    marginTop: -8,
    marginBottom: 2,
  },
  label: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    marginBottom: 6,
  },
  inputWrapper: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 9,
  },
  input: {
    flex: 1,
    minHeight: 48,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  codeInput: {
    letterSpacing: 5,
    fontFamily: "Inter_600SemiBold",
  },
  messageBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  messageText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontFamily: "Inter_400Regular",
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 2,
  },
  primaryButtonText: {
    fontSize: 16,
    fontFamily: "Sora_600SemiBold",
  },
  secondaryButton: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  linkText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  inlineActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  footerLink: {
    alignItems: "center",
    paddingTop: 24,
  },
  footerText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
});