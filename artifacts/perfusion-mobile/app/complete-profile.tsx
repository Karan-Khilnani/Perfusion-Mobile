import { Ionicons } from "@expo/vector-icons";
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

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  type ProfileCompletionInput,
  useAuth,
} from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

const PROVIDER_TYPES: Array<{
  value: NonNullable<ProfileCompletionInput["providerType"]>;
  label: string;
}> = [
  { value: "lab", label: "Diagnostic Lab" },
  { value: "consultant", label: "Consultant" },
  { value: "hospital", label: "Hospital" },
  { value: "teleradiology", label: "Teleradiology" },
  { value: "transport", label: "Ambulance" },
];

export default function CompleteProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, completeProfile, logout } = useAuth();
  const [role, setRole] =
    useState<ProfileCompletionInput["role"]>("care_seeker");
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [hospitalRegistrationNo, setHospitalRegistrationNo] = useState("");
  const [hospitalRegisteredOrg, setHospitalRegisteredOrg] = useState("");
  const [phone, setPhone] = useState("");
  const [providerType, setProviderType] =
    useState<ProfileCompletionInput["providerType"]>();
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (hospitalName.trim().length < 2) {
      setError("Enter your hospital or organization name.");
      return;
    }
    if (hospitalAddress.trim().length < 5) {
      setError("Enter the complete address.");
      return;
    }
    if (!hospitalRegistrationNo.trim()) {
      setError("Enter the registration number.");
      return;
    }
    if (hospitalRegisteredOrg.trim().length < 2) {
      setError("Enter the registering organization.");
      return;
    }
    if (role === "provider") {
      if (!providerType) {
        setError("Select a provider type.");
        return;
      }
      if (phone.replace(/\D/g, "").length < 7) {
        setError("Enter a valid provider phone number.");
        return;
      }
      if (location.trim().length < 2) {
        setError("Enter the provider city or location.");
        return;
      }
    }

    setSubmitting(true);
    try {
      await completeProfile({
        role,
        hospitalName: hospitalName.trim(),
        hospitalAddress: hospitalAddress.trim(),
        hospitalRegistrationNo: hospitalRegistrationNo.trim(),
        hospitalRegisteredOrg: hospitalRegisteredOrg.trim(),
        phone: phone.trim() || undefined,
        providerType: role === "provider" ? providerType : undefined,
        description:
          role === "provider" ? description.trim() || undefined : undefined,
        location: role === "provider" ? location.trim() : undefined,
      });
      router.replace("/account-status");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not complete your profile.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop:
            Platform.OS === "web" ? 67 + insets.top : insets.top + 24,
          paddingBottom:
            Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 32,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.icon, { backgroundColor: `${colors.primary}14` }]}>
        <Ionicons name="person-add-outline" size={28} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.foreground }]}>
        Complete your profile
      </Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Signed in as {user?.email}. Add your professional details to continue.
      </Text>

      {error && (
        <View
          style={[
            styles.errorBox,
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
          <Text style={[styles.errorText, { color: colors.destructive }]}>
            {error}
          </Text>
        </View>
      )}

      <Text style={[styles.label, { color: colors.foreground }]}>I am a</Text>
      <View style={styles.roleRow}>
        <Choice
          label="Care Seeker"
          icon="business-outline"
          selected={role === "care_seeker"}
          onPress={() => setRole("care_seeker")}
          colors={colors}
          testID="role-care-seeker"
        />
        <Choice
          label="Care Provider"
          icon="medkit-outline"
          selected={role === "provider"}
          onPress={() => setRole("provider")}
          colors={colors}
          testID="role-provider"
        />
      </View>

      <View style={styles.fields}>
        <Field
          label={
            role === "provider"
              ? "Business / organization name"
              : "Hospital / organization name"
          }
          value={hospitalName}
          onChangeText={setHospitalName}
          placeholder="Organization name"
          colors={colors}
          testID="profile-organization"
        />
        {role === "provider" && (
          <>
            <Text style={[styles.label, { color: colors.foreground }]}>
              Provider type
            </Text>
            <View style={styles.chipRow}>
              {PROVIDER_TYPES.map((item) => (
                <Pressable
                  key={item.value}
                  onPress={() => setProviderType(item.value)}
                  style={[
                    styles.chip,
                    {
                      borderColor:
                        providerType === item.value
                          ? colors.primary
                          : colors.border,
                      backgroundColor:
                        providerType === item.value
                          ? `${colors.primary}12`
                          : colors.card,
                    },
                  ]}
                  testID={`provider-type-${item.value}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color:
                          providerType === item.value
                            ? colors.primary
                            : colors.foreground,
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Field
              label="Provider phone"
              value={phone}
              onChangeText={setPhone}
              placeholder="+91 98765 43210"
              keyboardType="phone-pad"
              colors={colors}
              testID="profile-phone"
            />
            <Field
              label="City / location"
              value={location}
              onChangeText={setLocation}
              placeholder="City"
              colors={colors}
              testID="profile-location"
            />
            <Field
              label="Description (optional)"
              value={description}
              onChangeText={setDescription}
              placeholder="Services and specialties"
              multiline
              colors={colors}
              testID="profile-description"
            />
          </>
        )}
        <Field
          label="Address"
          value={hospitalAddress}
          onChangeText={setHospitalAddress}
          placeholder="Complete address"
          multiline
          colors={colors}
          testID="profile-address"
        />
        <Field
          label="Registration number"
          value={hospitalRegistrationNo}
          onChangeText={setHospitalRegistrationNo}
          placeholder="Registration number"
          colors={colors}
          testID="profile-registration-number"
        />
        <Field
          label="Registered organization"
          value={hospitalRegisteredOrg}
          onChangeText={setHospitalRegisteredOrg}
          placeholder="Registering authority"
          colors={colors}
          testID="profile-registering-organization"
        />
      </View>

      <Pressable
        onPress={submit}
        disabled={submitting}
        style={[
          styles.primaryButton,
          {
            backgroundColor: submitting
              ? `${colors.primary}80`
              : colors.primary,
          },
        ]}
        testID="complete-profile-button"
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryButtonText}>Submit profile</Text>
        )}
      </Pressable>
      <Pressable onPress={signOut} disabled={submitting}>
        <Text style={[styles.signOut, { color: colors.mutedForeground }]}>
          Sign out
        </Text>
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

function Choice({
  label,
  icon,
  selected,
  onPress,
  colors,
  testID,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.roleChoice,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? `${colors.primary}10` : colors.card,
        },
      ]}
      testID={testID}
    >
      <Ionicons
        name={icon}
        size={22}
        color={selected ? colors.primary : colors.mutedForeground}
      />
      <Text
        style={[
          styles.roleChoiceText,
          { color: selected ? colors.primary : colors.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = "default",
  multiline = false,
  colors,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad";
  multiline?: boolean;
  colors: ReturnType<typeof useColors>;
  testID: string;
}) {
  return (
    <View>
      <Text style={[styles.label, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCorrect={false}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          {
            color: colors.foreground,
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 24, gap: 16 },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 26, fontFamily: "Sora_700Bold" },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: "Inter_400Regular",
    marginTop: -8,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  label: { fontSize: 14, fontFamily: "Inter_500Medium", marginBottom: 6 },
  roleRow: { flexDirection: "row", gap: 12 },
  roleChoice: {
    flex: 1,
    minHeight: 82,
    borderWidth: 1.5,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  roleChoiceText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  fields: { gap: 14 },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  multilineInput: {
    height: 88,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  primaryButton: {
    height: 50,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Sora_600SemiBold",
  },
  signOut: {
    textAlign: "center",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    paddingVertical: 6,
  },
});