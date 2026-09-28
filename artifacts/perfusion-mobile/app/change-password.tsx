import { Feather } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Alert,
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

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

type Field = "currentPassword" | "newPassword" | "confirmPassword";

const FIELD_LABELS: Record<Field, string> = {
  currentPassword: "Current Password",
  newPassword: "New Password",
  confirmPassword: "Confirm New Password",
};

export default function ChangePasswordScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const newPasswordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);
  const [values, setValues] = useState<Record<Field, string>>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [visible, setVisible] = useState<Record<Field, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [generalError, setGeneralError] = useState("");
  const [networkError, setNetworkError] = useState("");
  const [saving, setSaving] = useState(false);
  const [googlePasswordUnavailable, setGooglePasswordUnavailable] = useState(false);
  const [showGooglePasswordForm, setShowGooglePasswordForm] = useState(false);

  const googleLinked = Boolean(user?.googleId);
  const showGoogleNotice = googlePasswordUnavailable || (googleLinked && !showGooglePasswordForm);
  const allFieldsFilled = Object.values(values).every((value) => value.length > 0);

  const setValue = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    setGeneralError("");
    setNetworkError("");
  };

  const toggleVisibility = (field: Field) => {
    setVisible((current) => ({ ...current, [field]: !current[field] }));
  };

  const save = async () => {
    if (!allFieldsFilled || saving || showGoogleNotice) return;
    setErrors({});
    setGeneralError("");
    setNetworkError("");

    if (values.newPassword !== values.confirmPassword) {
      setErrors({ confirmPassword: "Passwords do not match." });
      return;
    }

    setSaving(true);
    try {
      const response = await apiFetch("/api/profile/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof result.message === "string"
          ? result.message
          : "Could not change password.";
        const normalized = message.toLowerCase();
        if (response.status >= 500) {
          setNetworkError("The server couldn't complete the request. Check your connection and try again.");
        } else if (normalized.includes("google sign-in") || normalized.includes("does not have a password")) {
          setGooglePasswordUnavailable(true);
          setShowGooglePasswordForm(false);
          setValues({ currentPassword: "", newPassword: "", confirmPassword: "" });
        } else if (normalized.includes("current password")) {
          setErrors({ currentPassword: message });
        } else if (normalized.includes("new password")) {
          setErrors({ newPassword: message });
        } else {
          setGeneralError(message);
        }
        return;
      }

      Alert.alert("Password changed", "Your password has been updated.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        error instanceof TypeError ||
        /network request failed|failed to fetch|network error|timed out/i.test(message)
      ) {
        setNetworkError("Couldn't reach the server. Check your connection and try again.");
      } else {
        setGeneralError(message || "Could not change password.");
      }
    } finally {
      setSaving(false);
    }
  };

  const renderField = (
    field: Field,
    options: {
      autoComplete: "current-password" | "new-password";
      textContentType: "password" | "newPassword";
      inputRef?: React.RefObject<TextInput | null>;
      nextRef?: React.RefObject<TextInput | null>;
      returnKeyType: "next" | "done";
    },
  ) => (
    <View style={styles.fieldGroup} key={field}>
      <Text style={[styles.label, { color: colors.foreground }]}>{FIELD_LABELS[field]}</Text>
      <View style={[
        styles.inputShell,
        {
          borderColor: errors[field] ? colors.destructive : colors.border,
          backgroundColor: colors.card,
        },
      ]}>
        <TextInput
          ref={options.inputRef}
          value={values[field]}
          onChangeText={(value) => setValue(field, value)}
          secureTextEntry={!visible[field]}
          autoComplete={options.autoComplete}
          textContentType={options.textContentType}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          returnKeyType={options.returnKeyType}
          onSubmitEditing={() => options.nextRef?.current?.focus()}
          accessibilityLabel={FIELD_LABELS[field]}
          style={[styles.input, { color: colors.foreground }]}
          placeholder={FIELD_LABELS[field]}
          placeholderTextColor={colors.mutedForeground}
        />
        <Pressable
          onPress={() => toggleVisibility(field)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`${visible[field] ? "Hide" : "Show"} ${FIELD_LABELS[field].toLowerCase()}`}
          style={styles.visibilityButton}
        >
          <Feather name={visible[field] ? "eye-off" : "eye"} size={19} color={colors.mutedForeground} />
        </Pressable>
      </View>
      {field === "newPassword" && (
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>At least 8 characters.</Text>
      )}
      {!!errors[field] && <Text style={[styles.fieldError, { color: colors.destructive }]}>{errors[field]}</Text>}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to My Profile"
          >
            <Feather name="arrow-left" size={21} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.title, { color: colors.foreground }]}>Change Password</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        >
          {showGoogleNotice ? (
            <View style={[styles.googleNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.noticeIcon, { backgroundColor: colors.accent }]}>
                <Feather name="log-in" size={18} color={colors.primary} />
              </View>
              <Text style={[styles.noticeTitle, { color: colors.foreground }]}>Google sign-in is linked</Text>
              <Text style={[styles.noticeBody, { color: colors.mutedForeground }]}>
                {googlePasswordUnavailable
                  ? "This account doesn't have an app password yet. Set one up before changing it here."
                  : "Google-linked accounts need an app password to use this screen. Continue only if you've already set one; otherwise, set up an app password first."}
              </Text>
              {!googlePasswordUnavailable && (
                <Pressable
                  onPress={() => setShowGooglePasswordForm(true)}
                  accessibilityRole="button"
                  style={[styles.googleContinueButton, { borderColor: colors.border }]}
                >
                  <Text style={[styles.googleContinueText, { color: colors.primary }]}>Continue with app password</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <>
              <Text style={[styles.intro, { color: colors.mutedForeground }]}>
                Enter your current password, then choose a new one.
              </Text>
              {googleLinked && (
                <Pressable
                  onPress={() => setShowGooglePasswordForm(false)}
                  accessibilityRole="button"
                  style={styles.googleBackLink}
                >
                  <Text style={[styles.retry, { color: colors.primary }]}>Back to Google account information</Text>
                </Pressable>
              )}
              {renderField("currentPassword", {
                autoComplete: "current-password",
                textContentType: "password",
                nextRef: newPasswordRef,
                returnKeyType: "next",
              })}
              {renderField("newPassword", {
                autoComplete: "new-password",
                textContentType: "newPassword",
                inputRef: newPasswordRef,
                nextRef: confirmPasswordRef,
                returnKeyType: "next",
              })}
              {renderField("confirmPassword", {
                autoComplete: "new-password",
                textContentType: "newPassword",
                inputRef: confirmPasswordRef,
                returnKeyType: "done",
              })}
              {!!generalError && <Text style={[styles.generalError, { color: colors.destructive }]}>{generalError}</Text>}
              {!!networkError && (
                <View style={styles.networkErrorWrap}>
                  <Text style={[styles.generalError, { color: colors.destructive }]}>{networkError}</Text>
                  <Pressable onPress={() => void save()} accessibilityRole="button">
                    <Text style={[styles.retry, { color: colors.primary }]}>Retry</Text>
                  </Pressable>
                </View>
              )}
              <Pressable
                onPress={() => void save()}
                disabled={!allFieldsFilled || saving}
                accessibilityRole="button"
                style={[
                  styles.saveButton,
                  {
                    backgroundColor: colors.primary,
                    opacity: !allFieldsFilled || saving ? 0.48 : 1,
                  },
                ]}
              >
                <Text style={styles.saveButtonText}>{saving ? "Saving…" : "Save"}</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    minHeight: 62,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backButton: { width: 42, height: 42, alignItems: "flex-start", justifyContent: "center" },
  title: { flex: 1, fontSize: 19, fontFamily: "Sora_600SemiBold" },
  headerSpacer: { width: 42 },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  intro: { fontSize: 14, lineHeight: 21, marginBottom: 24 },
  fieldGroup: { marginBottom: 20 },
  label: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 8 },
  inputShell: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  input: {
    minHeight: 50,
    flex: 1,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  visibilityButton: { paddingHorizontal: 14, minHeight: 48, justifyContent: "center" },
  hint: { fontSize: 12, marginTop: 7 },
  fieldError: { fontSize: 12, marginTop: 7 },
  generalError: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  networkErrorWrap: { marginBottom: 16 },
  retry: { fontSize: 14, fontFamily: "Inter_600SemiBold", paddingVertical: 5 },
  saveButton: {
    minHeight: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  saveButtonText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  googleNotice: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
  },
  noticeIcon: {
    height: 38,
    width: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  noticeTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold", marginBottom: 7 },
  noticeBody: { fontSize: 14, lineHeight: 21 },
  googleContinueButton: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
  },
  googleContinueText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  googleBackLink: { alignSelf: "flex-start", marginBottom: 20 },
});