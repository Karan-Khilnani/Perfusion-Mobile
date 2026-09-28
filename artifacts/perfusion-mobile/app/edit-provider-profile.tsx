import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";

type AccountProfile = {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  city?: string;
  state?: string;
  location?: string;
};

type ProviderProfileData = {
  id: string;
  location?: string;
  phone?: string;
};

type ConsultantProfile = {
  id: string;
  name?: string;
  qualification?: string;
  specialization?: string;
  yearsExperience?: number;
  consultationFee?: string | number;
  registrationNumber?: string;
  registeredOrganization?: string;
  affiliatedInstitution?: string;
  portfolio?: string;
};

type FormValues = {
  displayName: string;
  email: string;
  city: string;
  state: string;
  phone: string;
  qualification: string;
  specialization: string;
  yearsExperience: string;
  consultationFee: string;
  registrationNumber: string;
  registeredOrganization: string;
  affiliatedInstitution: string;
  portfolio: string;
};

type FieldErrors = Partial<Record<keyof FormValues, string>>;

export default function EditProviderProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ consultantId?: string }>();
  const [selectedId, setSelectedId] = useState(params.consultantId);

  const account = useQuery<AccountProfile>({
    queryKey: ["provider-profile-account", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const response = await apiFetch("/api/auth/user");
      if (!response.ok) throw new Error("Unable to load account details.");
      return response.json();
    },
  });
  const provider = useQuery<ProviderProfileData>({
    queryKey: ["provider-profile-provider", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const response = await apiFetch("/api/providers/me");
      if (response.status === 404) return {} as ProviderProfileData;
      if (!response.ok) throw new Error("Unable to load provider details.");
      return response.json();
    },
  });
  const consultants = useQuery<ConsultantProfile[]>({
    queryKey: ["provider-profile-consultants", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const response = await apiFetch("/api/provider/my-consultants");
      if (!response.ok) throw new Error("Unable to load professional details.");
      return response.json();
    },
  });
  const consultant = consultants.data?.find((item) => item.id === selectedId)
    || consultants.data?.[0];
  const loading = account.isLoading || provider.isLoading || consultants.isLoading;
  const error = account.error || provider.error || consultants.error;

  if (loading) {
    return (
      <View style={[styles.state, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: "Edit Profile" }} />
        <ActivityIndicator color={colors.primary} />
        <Text style={{ color: colors.mutedForeground }}>Loading profile…</Text>
      </View>
    );
  }
  if (error || !account.data) {
    return (
      <View style={[styles.state, { backgroundColor: colors.background, paddingHorizontal: 24 }]}>
        <Stack.Screen options={{ title: "Edit Profile" }} />
        <Text style={{ color: colors.destructive, textAlign: "center" }}>
          {error instanceof Error ? error.message : "Unable to load profile details."}
        </Text>
        <Pressable onPress={() => { void Promise.all([account.refetch(), provider.refetch(), consultants.refetch()]); }}>
          <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Edit Profile" }} />
      {consultant ? (
        <EditProfileForm
          key={consultant.id}
          account={account.data}
          provider={provider.data}
          consultant={consultant}
          consultantOptions={consultants.data || []}
          selectedId={consultant.id}
          onSelectConsultant={setSelectedId}
          onBack={() => router.back()}
          insetsBottom={insets.bottom}
          colors={colors}
          queryClient={queryClient}
          userId={user?.id}
        />
      ) : (
        <EditProfileForm
          key="account-profile"
          account={account.data}
          provider={provider.data}
          consultant={null}
          consultantOptions={[]}
          selectedId=""
          onSelectConsultant={setSelectedId}
          onBack={() => router.back()}
          insetsBottom={insets.bottom}
          colors={colors}
          queryClient={queryClient}
          userId={user?.id}
        />
      )}
    </>
  );
}

function EditProfileForm({
  account,
  provider,
  consultant,
  consultantOptions,
  selectedId,
  onSelectConsultant,
  onBack,
  insetsBottom,
  colors,
  queryClient,
  userId,
}: {
  account: AccountProfile;
  provider?: ProviderProfileData;
  consultant: ConsultantProfile | null;
  consultantOptions: ConsultantProfile[];
  selectedId: string;
  onSelectConsultant: (id: string) => void;
  onBack: () => void;
  insetsBottom: number;
  colors: ReturnType<typeof useColors>;
  queryClient: ReturnType<typeof useQueryClient>;
  userId?: string;
}) {
  const [values, setValues] = useState<FormValues>(() => initialValues(account, provider, consultant));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const setField = (field: keyof FormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const save = async () => {
    const nextErrors: FieldErrors = {};
    if (!values.displayName.trim()) nextErrors.displayName = "Enter your display name.";
    if (!values.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      nextErrors.email = "Enter a valid email address.";
    }
    if (values.phone.trim() && values.phone.replace(/\D/g, "").length < 7) {
      nextErrors.phone = "Enter a valid contact phone.";
    }
    if (values.yearsExperience && (!Number.isFinite(Number(values.yearsExperience)) || Number(values.yearsExperience) < 0)) {
      nextErrors.yearsExperience = "Enter a valid number of years.";
    }
    if (values.consultationFee && (!Number.isFinite(Number(values.consultationFee.replace(/[₹,\s]/g, ""))) || Number(values.consultationFee.replace(/[₹,\s]/g, "")) < 0)) {
      nextErrors.consultationFee = "Enter a valid consultation fee.";
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    setFieldErrors({});
    try {
      const names = values.displayName.trim().split(/\s+/);
      const firstName = names.shift() || "";
      const lastName = names.join(" ");
      const response = await apiFetch("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({
          firstName,
          lastName,
          email: values.email.trim(),
          phone: values.phone.trim(),
        }),
      });
      const accountResult = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFieldErrors({
          [fieldForServerMessage(accountResult.message, "email")]: accountResult.message || "Could not save your account details.",
        });
        return;
      }

      const location = [values.city.trim(), values.state.trim()].filter(Boolean).join(", ");
      const providerResponse = await apiFetch("/api/providers/me", {
        method: "PATCH",
        body: JSON.stringify({ location, phone: values.phone.trim() }),
      });
      const providerResult = await providerResponse.json().catch(() => ({}));
      if (!providerResponse.ok) {
        setFieldErrors({
          [fieldForServerMessage(providerResult.message, "city")]: providerResult.message || "Could not save city and state.",
        });
        return;
      }

      if (consultant) {
        const consultantResponse = await apiFetch(`/api/provider/consultants/${consultant.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: values.displayName.trim(),
            qualification: values.qualification.trim(),
            specialization: values.specialization.trim(),
            yearsExperience: values.yearsExperience ? Number(values.yearsExperience) : 0,
            consultationFee: values.consultationFee.replace(/[₹,\s]/g, ""),
            registrationNumber: values.registrationNumber.trim(),
            registeredOrganization: values.registeredOrganization.trim(),
            affiliatedInstitution: values.affiliatedInstitution.trim(),
            portfolio: values.portfolio,
          }),
        });
        const consultantResult = await consultantResponse.json().catch(() => ({}));
        if (!consultantResponse.ok) {
          const serverErrors = consultantResult.errors || consultantResult.fieldErrors;
          if (serverErrors && typeof serverErrors === "object") {
            setFieldErrors(serverErrors as FieldErrors);
          } else {
            setFieldErrors({
              [fieldForServerMessage(consultantResult.message, "qualification")]: consultantResult.message || "Could not save professional details.",
            });
          }
          return;
        }
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["provider-profile-account", userId] }),
        queryClient.invalidateQueries({ queryKey: ["provider-profile-provider", userId] }),
        queryClient.invalidateQueries({ queryKey: ["provider-profile-consultants", userId] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-provider-consultants", userId] }),
      ]);
      onBack();
    } catch (cause) {
      setFieldErrors({ displayName: cause instanceof Error ? cause.message : "Could not save profile details." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 12 : 10,
          paddingBottom: Platform.OS === "web" ? 34 : insetsBottom + 28,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable onPress={onBack} style={[styles.backButton, { borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Back without saving">
          <Feather name="arrow-left" size={18} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.foreground }]}>Edit Profile</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Update your account and professional details.</Text>
        </View>
      </View>

      {consultantOptions.length > 1 && (
        <View style={styles.selectorBlock}>
          <Text style={[styles.label, { color: colors.foreground }]}>Consultant profile</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {consultantOptions.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => onSelectConsultant(item.id)}
                style={[styles.chip, {
                  borderColor: item.id === selectedId ? colors.primary : colors.border,
                  backgroundColor: item.id === selectedId ? `${colors.primary}12` : colors.card,
                }]}
              >
                <Text style={{ color: item.id === selectedId ? colors.primary : colors.foreground, fontFamily: "Inter_500Medium" }}>
                  {item.name || "Consultant"}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ProviderEditField label="DISPLAY NAME" value={values.displayName} onChangeText={(text) => setField("displayName", text)} error={fieldErrors.displayName} colors={colors} />
      <ProviderEditField label="EMAIL" value={values.email} onChangeText={(text) => setField("email", text)} error={fieldErrors.email} keyboardType="email-address" colors={colors} />
      <ProviderEditField label="CITY" value={values.city} onChangeText={(text) => setField("city", text)} error={fieldErrors.city} colors={colors} />
      <ProviderEditField label="STATE" value={values.state} onChangeText={(text) => setField("state", text)} error={fieldErrors.state} colors={colors} />
      <ProviderEditField label="CONTACT PHONE" value={values.phone} onChangeText={(text) => setField("phone", text)} error={fieldErrors.phone} keyboardType="phone-pad" colors={colors} />
      <ProviderEditField label="QUALIFICATION" value={values.qualification} onChangeText={(text) => setField("qualification", text)} error={fieldErrors.qualification} colors={colors} />
      <ProviderEditField label="SPECIALIZATION" value={values.specialization} onChangeText={(text) => setField("specialization", text)} error={fieldErrors.specialization} colors={colors} />
      <ProviderEditField label="YEARS OF EXPERIENCE" value={values.yearsExperience} onChangeText={(text) => setField("yearsExperience", text.replace(/[^\d]/g, ""))} error={fieldErrors.yearsExperience} keyboardType="numeric" colors={colors} />
      <ProviderEditField label="CONSULTATION FEE" value={values.consultationFee} onChangeText={(text) => setField("consultationFee", text.replace(/[^\d.,₹\s]/g, ""))} error={fieldErrors.consultationFee} keyboardType="decimal-pad" colors={colors} />
      <ProviderEditField label="REGISTRATION NUMBER" value={values.registrationNumber} onChangeText={(text) => setField("registrationNumber", text)} error={fieldErrors.registrationNumber} colors={colors} />
      <ProviderEditField label="REGISTERED WITH" value={values.registeredOrganization} onChangeText={(text) => setField("registeredOrganization", text)} error={fieldErrors.registeredOrganization} colors={colors} />
      <ProviderEditField label="AFFILIATED INSTITUTE" value={values.affiliatedInstitution} onChangeText={(text) => setField("affiliatedInstitution", text)} error={fieldErrors.affiliatedInstitution} colors={colors} />
      <ProviderEditField label="PORTFOLIO — ABOUT" value={values.portfolio} onChangeText={(text) => setField("portfolio", text)} error={fieldErrors.portfolio} multiline colors={colors} />

      <Pressable
        onPress={() => void save()}
        disabled={submitting}
        style={[styles.saveButton, { backgroundColor: colors.primary, opacity: submitting ? 0.75 : 1 }]}
      >
        {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Save Changes</Text>}
      </Pressable>
    </KeyboardAwareScrollViewCompat>
  );
}

function initialValues(
  account: AccountProfile,
  provider?: ProviderProfileData,
  consultant: ConsultantProfile | null = null,
): FormValues {
  const fullName = [account.firstName, account.lastName].filter(Boolean).join(" ");
  const parts = (provider?.location || account.location || "").split(",").map((part) => part.trim());
  return {
    displayName: consultant?.name || fullName || account.name || "",
    email: account.email || "",
    city: provider?.location !== undefined ? parts[0] || "" : account.city || "",
    state: provider?.location !== undefined ? parts.slice(1).join(", ") || "" : account.state || "",
    phone: account.phone || provider?.phone || "",
    qualification: consultant?.qualification || "",
    specialization: consultant?.specialization || "",
    yearsExperience: consultant?.yearsExperience === undefined ? "" : String(consultant.yearsExperience),
    consultationFee: consultant?.consultationFee === undefined ? "" : String(consultant.consultationFee),
    registrationNumber: consultant?.registrationNumber || "",
    registeredOrganization: consultant?.registeredOrganization || "",
    affiliatedInstitution: consultant?.affiliatedInstitution || "",
    portfolio: consultant?.portfolio || "",
  };
}

function fieldForServerMessage(message: unknown, fallback: keyof FormValues): keyof FormValues {
  if (typeof message !== "string") return fallback;
  const text = message.toLowerCase();
  const matches: Array<[string[], keyof FormValues]> = [
    [["display name", "name"], "displayName"],
    [["email"], "email"],
    [["city", "location"], "city"],
    [["state"], "state"],
    [["phone"], "phone"],
    [["qualification"], "qualification"],
    [["specialization"], "specialization"],
    [["experience", "years"], "yearsExperience"],
    [["fee", "consultation"], "consultationFee"],
    [["registration number", "registrationnumber"], "registrationNumber"],
    [["registered with", "registered organization", "registeredorganization"], "registeredOrganization"],
    [["affiliated institute", "affiliatedinstitution"], "affiliatedInstitution"],
    [["portfolio"], "portfolio"],
  ];
  return matches.find(([terms]) => terms.some((term) => text.includes(term)))?.[1] || fallback;
}

function ProviderEditField({
  label,
  value,
  onChangeText,
  colors,
  error,
  keyboardType = "default",
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  colors: ReturnType<typeof useColors>;
  error?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "decimal-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.mutedForeground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.mutedForeground}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        autoCorrect={false}
        multiline={multiline}
        style={[
          styles.input,
          multiline && styles.multiline,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border },
        ]}
      />
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingHorizontal: 20, gap: 13 },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 5 },
  backButton: { width: 38, height: 38, borderWidth: 1, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontFamily: "Sora_600SemiBold" },
  subtitle: { fontSize: 13, marginTop: 3 },
  field: { marginBottom: 2 },
  label: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.3, marginBottom: 6 },
  input: { minHeight: 47, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  multiline: { minHeight: 110, paddingTop: 11, textAlignVertical: "top" },
  errorText: { color: "#DB2841", fontSize: 12, marginTop: 5 },
  selectorBlock: { gap: 5, marginBottom: 3 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  saveButton: { minHeight: 49, borderRadius: 25, alignItems: "center", justifyContent: "center", marginTop: 4 },
  saveText: { color: "#FFFFFF", fontSize: 15, fontFamily: "Inter_700Bold" },
});