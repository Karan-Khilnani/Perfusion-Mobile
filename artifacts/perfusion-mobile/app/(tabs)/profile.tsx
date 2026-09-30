import { Feather, Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useFocusEffect } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";

import { useAuth } from "@/contexts/AuthContext";
import { BrandMark } from "@/components/BrandMark";
import { ScreenHeading } from "@/components/ScreenHeading";
import { apiFetch, getBaseUrl, getStoredCookie } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { designTokens } from "@/constants/designTokens";

type ProviderConsultant = {
  id: string;
  name?: string;
  displayName?: string;
  status?: "active" | "paused" | "deleted" | string;
};

function ProfileRow({
  icon,
  label,
  value,
  colors,
}: {
  icon: any;
  label: string;
  value?: string;
  colors: any;
}) {
  if (!value) return null;
  return (
    <View
      style={[styles.row, { borderBottomColor: colors.border }]}
    >
      <Ionicons name={icon} size={18} color={colors.mutedForeground} />
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
          {label}
        </Text>
        <Text
          style={[styles.rowValue, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {value}
        </Text>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, callbackDevice } = useAuth();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  const providerConsultants = useQuery<ProviderConsultant[]>({
    queryKey: ["mobile-provider-consultants", user?.id],
    enabled: user?.role === "provider",
    refetchOnMount: "always",
    queryFn: async () => {
      const response = await apiFetch("/api/provider/my-consultants");
      if (!response.ok) throw new Error("Unable to load provider availability.");
      return response.json();
    },
  });
  const availabilityMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "paused" }) => {
      const response = await apiFetch(`/api/provider/consultants/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Unable to update availability.");
      return data as ProviderConsultant;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["mobile-provider-consultants", user?.id] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-consultants"] }),
      ]);
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: ["mobile-provider-consultants", user?.id] });
    },
  });
  useFocusEffect(
    React.useCallback(() => {
      if (user?.role === "provider") void providerConsultants.refetch();
    }, [providerConsultants.refetch, user?.role]),
  );

  const handleLogout = () => {
    if (Platform.OS === "web") {
      logout();
      return;
    }
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          try {
            await logout();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const roleLabel = () => {
    if (!user?.role) return "User";
    if (user.role === "admin") return "Administrator";
    if (user.role === "provider") return "Healthcare Provider";
    return "Care Seeker";
  };

  if (user?.role === "provider") {
    return <ProviderMyProfile />;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 20,
          paddingBottom:
            Platform.OS === "web" ? 84 + 34 : insets.bottom + 80,
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.brandRow}><BrandMark compact /></View>
      <ScreenHeading title="Profile" subtitle="Account and hospital details" />
      <View style={[styles.avatarSection, { backgroundColor: colors.quiet }]}>
        <View
          style={[
            styles.avatarLarge,
            { backgroundColor: `${colors.card}22` },
          ]}
        >
          <Text style={[styles.avatarInitial, { color: colors.card }]}>
            {(user?.name || user?.email || "U")[0].toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.userName, { color: colors.card }]}>
          {user?.name || user?.email || "User"}
        </Text>
        <View
          style={[
            styles.rolePill,
            { backgroundColor: `${colors.card}E8`, borderColor: colors.card },
          ]}
        >
          <Text style={[styles.roleText, { color: colors.quiet }]}>
            {roleLabel()}
          </Text>
        </View>
        {!user?.approved && (
          <View
            style={[
              styles.pendingBadge,
              { backgroundColor: `${colors.warning}12`, borderColor: `${colors.warning}25` },
            ]}
          >
            <Ionicons name="time-outline" size={14} color={colors.warning} />
            <Text style={[styles.pendingText, { color: colors.warning }]}>
              Pending approval
            </Text>
          </View>
        )}
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>
          Account Details
        </Text>
        <ProfileRow
          icon="mail-outline"
          label="Email"
          value={user?.email}
          colors={colors}
        />
        <ProfileRow
          icon="person-outline"
          label="Name"
          value={user?.name}
          colors={colors}
        />
        <ProfileRow
          icon="business-outline"
          label="Hospital"
          value={[user?.hospitalName, user?.hospitalAddress || user?.location || user?.city].filter(Boolean).join(" · ")}
          colors={colors}
        />
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color={colors.mutedForeground}
          />
          <View style={styles.rowContent}>
            <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
              Status
            </Text>
            <Text
              style={[
                styles.rowValue,
                {
                  color: user?.approved ? colors.success : colors.warning,
                },
              ]}
            >
              {user?.approved ? "Approved" : "Pending Approval"}
            </Text>
          </View>
        </View>
      </View>

      {user?.role === "provider" && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            Availability
          </Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground, marginBottom: 12 }]}>
            Choose whether seekers can book your consultant profile.
          </Text>
          {providerConsultants.isLoading ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={{ color: colors.mutedForeground }}>Loading availability…</Text>
            </View>
          ) : providerConsultants.isError ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.destructive }}>
                {providerConsultants.error instanceof Error
                  ? providerConsultants.error.message
                  : "Unable to load availability."}
              </Text>
              <Pressable onPress={() => providerConsultants.refetch()} accessibilityRole="button">
                <Text style={{ color: colors.primary, fontWeight: "600" }}>Try again</Text>
              </Pressable>
            </View>
          ) : providerConsultants.data?.length ? (
            <View>
              {providerConsultants.data.map((consultant, index) => {
                const canToggle = consultant.status === "active" || consultant.status === "paused";
                const isAvailable = consultant.status === "active";
                const updating = availabilityMutation.isPending
                  && availabilityMutation.variables?.id === consultant.id;
                return (
                  <View
                    key={consultant.id}
                    style={[
                      styles.row,
                      {
                        borderBottomColor: colors.border,
                        borderBottomWidth: index === providerConsultants.data!.length - 1 ? 0 : StyleSheet.hairlineWidth,
                        paddingVertical: 13,
                      },
                    ]}
                  >
                    <View style={[styles.rowContent, { paddingRight: 10 }]}>
                      <Text style={[styles.rowLabel, { color: colors.mutedForeground }]}>
                        {consultant.displayName || consultant.name || "Consultant"}
                      </Text>
                      <Text
                        style={[
                          styles.rowValue,
                          { color: canToggle ? (isAvailable ? colors.success : colors.mutedForeground) : colors.warning },
                        ]}
                      >
                        {consultant.status === "active"
                          ? "Available"
                          : consultant.status === "paused"
                            ? "Unavailable"
                            : "Status unavailable"}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      {updating && <ActivityIndicator size="small" color={colors.primary} />}
                      <Switch
                        value={isAvailable}
                        disabled={!canToggle || availabilityMutation.isPending}
                        onValueChange={(available) => {
                          availabilityMutation.reset();
                          availabilityMutation.mutate({
                            id: consultant.id,
                            status: available ? "active" : "paused",
                          });
                        }}
                        trackColor={{ false: colors.border, true: `${colors.success}99` }}
                        thumbColor={isAvailable ? colors.success : colors.mutedForeground}
                        accessibilityRole="switch"
                        accessibilityLabel={`Availability for ${consultant.displayName || consultant.name || "consultant"}`}
                        accessibilityState={{ checked: isAvailable, disabled: !canToggle || availabilityMutation.isPending }}
                      />
                    </View>
                  </View>
                );
              })}
              {availabilityMutation.isError && (
                <Text style={{ color: colors.destructive, marginTop: 10 }}>
                  {availabilityMutation.error instanceof Error
                    ? availabilityMutation.error.message
                    : "Unable to update availability. The saved state was restored."}
                </Text>
              )}
            </View>
          ) : (
            <Text style={[styles.rowValue, { color: colors.mutedForeground }]}>
              No consultant profile is connected to this provider account yet.
            </Text>
          )}
        </View>
      )}

      {user?.role !== "admin" && (
        <Pressable
          onPress={() => router.push("/callback-device")}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, padding: 16 }]}
          testID="edit-callback-device"
        >
          <Text style={[styles.cardTitle, { color: colors.foreground, padding: 0 }]}>Callback Device</Text>
          <Text style={[styles.rowValue, { color: colors.mutedForeground, marginTop: 6 }]}>
            {callbackDevice ? `${callbackDevice.deviceName} · ${callbackDevice.phoneNumber}` : "Set up your callback number"}
          </Text>
        </Pressable>
      )}

      {user?.role === "care_seeker" && (
        <>
          <ProfileLink
            icon="lock"
            title="Change Password"
            colors={colors}
            onPress={() => router.push("/change-password" as never)}
          />
          <ProfileLink
            icon="help-circle"
            title="Help & Support"
            colors={colors}
            onPress={() => Alert.alert("Help & Support", "Contact support through your Perfusion administrator.")}
          />
        </>
      )}

      <Pressable
        onPress={handleLogout}
        disabled={loggingOut}
        style={({ pressed }) => [
          styles.logoutButton,
          {
            backgroundColor: `${colors.destructive}10`,
            borderColor: `${colors.destructive}25`,
            opacity: pressed || loggingOut ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons
          name="log-out-outline"
          size={20}
          color={colors.destructive}
        />
        <Text style={[styles.logoutText, { color: colors.destructive }]}>
          {loggingOut ? "Signing out..." : "Sign Out"}
        </Text>
      </Pressable>

      <Text style={[styles.version, { color: colors.mutedForeground }]}>
        Perfusion Mobile v1.0
      </Text>
    </ScrollView>
  );
}

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
  profileImageUrl?: string;
  registrationDocumentUrl?: string;
};

type ProviderProfileData = {
  id: string;
  type?: string;
  name?: string;
  location?: string;
  phone?: string;
  verificationStatus?: string;
  registrationDocumentUrl?: string;
};

type ConsultantProfile = {
  id: string;
  name?: string;
  displayName?: string;
  photoUrl?: string;
  specialization?: string;
  qualification?: string;
  yearsExperience?: number;
  consultationFee?: string | number;
  registrationNumber?: string;
  registeredOrganization?: string;
  affiliatedInstitution?: string;
  registrationDocumentUrl?: string;
  digitalSignatureUrl?: string;
  portfolio?: string;
  approvalStatus?: string;
  status?: string;
  registrationDocuments?: Array<{ id: string; filename: string; status: string | null; url?: string }>;
  portfolioPhotos?: Array<{ id: string; url: string; filename: string }>;
};
type ConsultantPortfolioPhoto = NonNullable<ConsultantProfile["portfolioPhotos"]>[number];

type ProfileColors = ReturnType<typeof useColors>;

function absoluteFileUrl(uri?: string | null) {
  if (!uri) return undefined;
  return /^https?:\/\//i.test(uri) ? uri : `${getBaseUrl()}${uri}`;
}

async function uploadProfileFile(
  base64: string,
  filename: string,
  mimeType: string,
): Promise<string> {
  const response = await apiFetch("/api/upload/document", {
    method: "POST",
    body: JSON.stringify({ base64, filename, mimeType }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.url !== "string") {
    throw new Error(data.message || "The file could not be saved.");
  }
  return data.url;
}

async function uploadProviderProfileMedia(
  consultantId: string,
  kind: "photo" | "signature" | "portfolio_photo" | "registration_document",
  uri: string,
  filename: string,
  webFile?: globalThis.File,
): Promise<{ id: string; url?: string; status?: string }> {
  const form = new FormData();
  const file = Platform.OS === "web" && webFile ? webFile : new ExpoFile(uri);
  form.append("file", file, filename);
  form.append("kind", kind);
  const cookie = await getStoredCookie();
  const response = await expoFetch(
    `${getBaseUrl()}/api/provider/consultants/${encodeURIComponent(consultantId)}/media`,
    {
      method: "POST",
      credentials: "include",
      headers: { "X-Mobile-Client": "1", ...(cookie ? { Cookie: cookie } : {}) },
      body: form,
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `Upload failed (${response.status}).`);
  return data as { id: string; url?: string; status?: string };
}

function ProviderMyProfile() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [consultantId, setConsultantId] = useState<string | undefined>();
  const [loggingOut, setLoggingOut] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedPortfolioPhoto, setSelectedPortfolioPhoto] = useState<ConsultantPortfolioPhoto | null>(null);

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
  const selectedConsultant = consultants.data?.find((item) => item.id === consultantId)
    || consultants.data?.[0];
  const displayName = [account.data?.firstName, account.data?.lastName]
    .filter(Boolean)
    .join(" ")
    || account.data?.name
    || user?.name
    || "Provider";
  const cityState = provider.data?.location || account.data?.location || "";
  const [city, state] = cityState.split(",").map((part) => part.trim());
  const status = provider.data?.verificationStatus || "Unavailable";
  const avatarUri = absoluteFileUrl(selectedConsultant?.photoUrl || account.data?.profileImageUrl);
  const consultantDoc = selectedConsultant?.registrationDocumentUrl;
  const legacyDocUri = absoluteFileUrl(consultantDoc || provider.data?.registrationDocumentUrl || account.data?.registrationDocumentUrl);
  const signatureUri = absoluteFileUrl(selectedConsultant?.digitalSignatureUrl);
  const registrationDocuments = selectedConsultant?.registrationDocuments || [];
  const portfolioPhotos = selectedConsultant?.portfolioPhotos || [];

  const refreshProfile = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["provider-profile-account", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["provider-profile-provider", user?.id] }),
      queryClient.invalidateQueries({ queryKey: ["provider-profile-consultants", user?.id] }),
    ]);
  };

  const patchConsultant = async (id: string, payload: Record<string, unknown>) => {
    const response = await apiFetch(`/api/provider/consultants/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not save the consultant profile.");
    return data;
  };

  const chooseImage = async (useCamera: boolean) => {
    const permission = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", useCamera
        ? "Allow camera access to take a profile photo."
        : "Allow photo access to choose a profile photo.");
      return;
    }
    const picker = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await picker({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    setBusyAction("photo");
    try {
      const asset = result.assets[0];
      let url: string;
      if (selectedConsultant?.id) {
        const uploaded = await uploadProviderProfileMedia(
          selectedConsultant.id,
          "photo",
          asset.uri,
          asset.fileName || "provider-profile.jpg",
          asset.file,
        );
        if (!uploaded.url) throw new Error("The photo upload did not return a profile photo URL.");
        url = uploaded.url;
      } else {
        if (!asset.base64) throw new Error("The selected photo could not be read.");
        url = await uploadProfileFile(
          asset.base64,
          asset.fileName || "provider-profile.jpg",
          asset.mimeType || "image/jpeg",
        );
      }
      if (!selectedConsultant?.id) {
        const response = await apiFetch("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({ profileImageUrl: url }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not update your photo.");
      }
      await refreshProfile();
      await refreshUser();
    } catch (error) {
      Alert.alert("Photo upload failed", error instanceof Error ? error.message : "Could not update your photo.");
    } finally {
      setBusyAction(null);
    }
  };

  const changePhoto = () => Alert.alert("Profile photo", "Choose a source", [
    { text: "Camera", onPress: () => void chooseImage(true) },
    { text: "Gallery", onPress: () => void chooseImage(false) },
    { text: "Cancel", style: "cancel" },
  ]);

  const uploadRegistrationDocument = async () => {
    if (!selectedConsultant?.id) {
      Alert.alert("Unable to add document", "A consultant profile is required to save a professional registration document.");
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const file = result.assets[0];
    if (file.size && file.size > 5 * 1024 * 1024) {
      Alert.alert("File too large", "Choose a file smaller than 5 MB.");
      return;
    }
    setBusyAction("document");
    try {
      await uploadProviderProfileMedia(selectedConsultant.id, "registration_document", file.uri, file.name, file.file);
      await refreshProfile();
    } catch (error) {
      Alert.alert("Document upload failed", error instanceof Error ? error.message : "Could not save this document.");
    } finally {
      setBusyAction(null);
    }
  };

  const updateSignature = async () => {
    if (!selectedConsultant?.id) {
      Alert.alert("Unable to update signature", "A consultant profile is required to save a signature.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to choose a signature image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.9,
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    setBusyAction("signature");
    try {
      const asset = result.assets[0];
      await uploadProviderProfileMedia(
        selectedConsultant.id,
        "signature",
        asset.uri,
        asset.fileName || "provider-signature.png",
        asset.file,
      );
      await refreshProfile();
    } catch (error) {
      Alert.alert("Signature upload failed", error instanceof Error ? error.message : "Could not save this signature.");
    } finally {
      setBusyAction(null);
    }
  };

  const openDocument = async (document: { id?: string; url?: string }) => {
    let url = document.url || (document.id === "legacy" ? legacyDocUri : undefined);
    if (!url && document.id && selectedConsultant?.id) {
      const response = await apiFetch(`/api/provider/consultants/${selectedConsultant.id}/media/${document.id}/signed-url`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) {
        Alert.alert("Unable to open file", data.message || "Could not open the registration document.");
        return;
      }
      url = data.url;
    }
    const documentUri = absoluteFileUrl(url);
    if (!documentUri) return;
    try {
      await Linking.openURL(documentUri);
    } catch {
      Alert.alert("Unable to open file", "This document link could not be opened on this device.");
    }
  };

  const addPortfolioPhoto = async () => {
    if (!selectedConsultant?.id) {
      Alert.alert("Unable to add photo", "A consultant profile is required to save portfolio photos.");
      return;
    }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow photo access to choose a portfolio image.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      quality: 0.88,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusyAction("portfolio");
    try {
      await uploadProviderProfileMedia(
        selectedConsultant.id,
        "portfolio_photo",
        asset.uri,
        asset.fileName || `portfolio-${Date.now()}.jpg`,
        asset.file,
      );
      await refreshProfile();
    } catch (error) {
      Alert.alert("Photo upload failed", error instanceof Error ? error.message : "Could not save this portfolio photo.");
    } finally {
      setBusyAction(null);
    }
  };

  const deletePortfolioPhoto = (photo: ConsultantPortfolioPhoto) => {
    if (!selectedConsultant?.id) return;
    Alert.alert("Delete portfolio photo", "This photo will be removed from your portfolio.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const response = await apiFetch(`/api/provider/consultants/${selectedConsultant.id}/media/${photo.id}`, { method: "DELETE" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.message || "Could not delete this photo.");
            setSelectedPortfolioPhoto(null);
            await refreshProfile();
          } catch (error) {
            Alert.alert("Delete failed", error instanceof Error ? error.message : "Could not delete this photo.");
          }
        },
      },
    ]);
  };

  const doLogout = () => {
    if (Platform.OS === "web") {
      void logout();
      return;
    }
    Alert.alert("Log out", "You'll need to log in again to use Perfusion.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log Out",
        style: "destructive",
        onPress: async () => {
          setLoggingOut(true);
          try {
            await logout();
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  };

  const goEdit = () => {
    router.push({
      pathname: "/edit-provider-profile",
      params: selectedConsultant?.id ? { consultantId: selectedConsultant.id } : {},
    });
  };

  const loading = account.isLoading || provider.isLoading || consultants.isLoading;
  const loadError = account.error || provider.error || consultants.error;
  const sectionStyle = [providerProfileStyles.section, { backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        paddingTop: Platform.OS === "web" ? 67 + insets.top : insets.top + 16,
        paddingBottom: Platform.OS === "web" ? 34 + insets.bottom : insets.bottom + 42,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={providerProfileStyles.pageHeading}>
        <BrandMark compact />
        <Text style={[providerProfileStyles.pageTitle, { color: colors.quiet }]}>My Profile</Text>
      </View>
      {loading ? (
        <View style={providerProfileStyles.centerState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.mutedForeground }}>Loading provider profile…</Text>
        </View>
      ) : loadError ? (
        <View style={[providerProfileStyles.centerState, { paddingHorizontal: 24 }]}>
          <Text style={{ color: colors.destructive, textAlign: "center" }}>
            {loadError instanceof Error ? loadError.message : "Unable to load provider profile."}
          </Text>
          <Pressable onPress={() => { void Promise.all([account.refetch(), provider.refetch(), consultants.refetch()]); }}>
            <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {consultants.data && consultants.data.length > 1 && (
            <View style={providerProfileStyles.selectorWrap}>
              <Text style={[providerProfileStyles.eyebrow, { color: colors.mutedForeground }]}>CONSULTANT PROFILE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {consultants.data.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setConsultantId(item.id)}
                    style={[
                      providerProfileStyles.selector,
                      {
                        borderColor: selectedConsultant?.id === item.id ? colors.primary : colors.border,
                        backgroundColor: selectedConsultant?.id === item.id ? `${colors.primary}12` : colors.card,
                      },
                    ]}
                  >
                    <Text style={{ color: selectedConsultant?.id === item.id ? colors.primary : colors.foreground, fontFamily: "Inter_500Medium" }}>
                      {item.name || item.displayName || "Consultant"}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
          <View style={[providerProfileStyles.hero, { backgroundColor: colors.quiet, borderColor: colors.quiet }]}>
            <Pressable onPress={goEdit} style={[providerProfileStyles.editButton, { backgroundColor: colors.card }]} accessibilityRole="button" accessibilityLabel="Edit profile">
              <Feather name="edit-2" size={16} color={colors.foreground} />
            </Pressable>
            <View style={providerProfileStyles.avatarWrap}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={providerProfileStyles.avatar} />
              ) : (
                <View style={[providerProfileStyles.avatar, { backgroundColor: `${colors.card}22`, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="person-outline" size={32} color={colors.card} />
                </View>
              )}
              <Pressable onPress={changePhoto} style={[providerProfileStyles.cameraButton, { backgroundColor: colors.primary }]} accessibilityRole="button" accessibilityLabel="Change profile photo">
                {busyAction === "photo" ? <ActivityIndicator size="small" color={colors.card} /> : <Feather name="plus" size={16} color={colors.card} />}
              </Pressable>
            </View>
            <Text style={[providerProfileStyles.heroName, { color: colors.card }]}>{selectedConsultant?.name || displayName}</Text>
            <Text style={[providerProfileStyles.heroSub, { color: `${colors.card}D9` }]}>
              {[selectedConsultant?.specialization, provider.data?.name].filter(Boolean).join(" · ") || "Healthcare Provider"}
            </Text>
            <View style={[providerProfileStyles.verificationBadge, { backgroundColor: colors.card }]}>
              <Ionicons name="shield-checkmark-outline" size={14} color={status.toLowerCase() === "verified" ? colors.success : colors.warning} />
              <Text style={{ color: status.toLowerCase() === "verified" ? colors.success : colors.warning, fontFamily: "Inter_600SemiBold", fontSize: 12 }}>
                {status}
              </Text>
            </View>
          </View>

          <ProfileSection title="PERSONAL DETAILS" colors={colors} style={sectionStyle}>
            <ProfileValue label="Display Name" value={displayName} colors={colors} />
            <ProfileValue label="Email" value={account.data?.email || user?.email} colors={colors} />
             <ProfileValue label="City" value={provider.data?.location !== undefined ? city : account.data?.city} colors={colors} />
             <ProfileValue label="State" value={provider.data?.location !== undefined ? state : account.data?.state} colors={colors} />
            <ProfileValue label="Contact Phone" value={account.data?.phone || provider.data?.phone} colors={colors} last />
          </ProfileSection>

          <ProfileSection title="PROFESSIONAL DETAILS" colors={colors} style={sectionStyle}>
            <ProfileValue label="Qualification" value={selectedConsultant?.qualification} colors={colors} />
            <ProfileValue label="Specialization" value={selectedConsultant?.specialization} colors={colors} />
            <ProfileValue label="Years of Experience" value={selectedConsultant?.yearsExperience === undefined ? undefined : `${selectedConsultant.yearsExperience} years`} colors={colors} />
            <ProfileValue label="Consultation Fee" value={selectedConsultant?.consultationFee === undefined ? undefined : `₹${selectedConsultant.consultationFee}`} colors={colors} />
            <ProfileValue label="Registration Number" value={selectedConsultant?.registrationNumber} colors={colors} />
            <ProfileValue label="Registered With" value={selectedConsultant?.registeredOrganization} colors={colors} />
            <ProfileValue label="Affiliated Institute" value={selectedConsultant?.affiliatedInstitution} colors={colors} last />
          </ProfileSection>

          <View style={sectionStyle}>
            <Text style={[providerProfileStyles.sectionTitle, { color: colors.mutedForeground }]}>REGISTRATION DOCUMENTS</Text>
            {registrationDocuments.map((document) => (
              <View key={document.id} style={[providerProfileStyles.docRow, { borderBottomColor: colors.border }]}>
                <View style={[providerProfileStyles.docIcon, { backgroundColor: colors.background }]}>
                  <Feather name="file-text" size={16} color={colors.foreground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[providerProfileStyles.docName, { color: colors.foreground }]} numberOfLines={1}>{document.filename}</Text>
                   <Text style={{ color: document.status?.toLowerCase() === "verified" ? colors.success : document.status ? colors.warning : colors.mutedForeground, fontSize: 12 }}>{document.status || "Status not available"}</Text>
                </View>
                <Pressable onPress={() => void openDocument(document)} style={providerProfileStyles.inlineAction}><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>View</Text></Pressable>
              </View>
            ))}
             {legacyDocUri && !registrationDocuments.some((document) => document.id === "legacy" || document.url === legacyDocUri) && (
              <View style={[providerProfileStyles.docRow, { borderBottomColor: colors.border }]}>
                <View style={[providerProfileStyles.docIcon, { backgroundColor: colors.background }]}>
                  <Feather name="file-text" size={16} color={colors.foreground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[providerProfileStyles.docName, { color: colors.foreground }]} numberOfLines={1}>Registration document</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Legacy file</Text>
                </View>
                <Pressable onPress={() => void openDocument({ url: legacyDocUri })} style={providerProfileStyles.inlineAction}><Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>View</Text></Pressable>
              </View>
            )}
            {!registrationDocuments.length && !legacyDocUri && (
              <Text style={[providerProfileStyles.emptyCopy, { color: colors.mutedForeground }]}>No registration document has been added.</Text>
            )}
            <Pressable onPress={() => void uploadRegistrationDocument()} disabled={busyAction === "document"} style={providerProfileStyles.actionRow}>
              {busyAction === "document" ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="plus" size={17} color={colors.primary} />}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{busyAction === "document" ? "Uploading…" : "Add document"}</Text>
            </Pressable>
          </View>

          <View style={sectionStyle}>
            <Text style={[providerProfileStyles.sectionTitle, { color: colors.mutedForeground }]}>SIGNATURE</Text>
            {signatureUri ? (
              <Image source={{ uri: signatureUri }} resizeMode="contain" style={[providerProfileStyles.signatureImage, { backgroundColor: colors.background }]} />
            ) : (
              <View style={[providerProfileStyles.signatureEmpty, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Feather name="edit-3" size={22} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>No signature on file</Text>
              </View>
            )}
            <Pressable onPress={() => void updateSignature()} disabled={busyAction === "signature"} style={providerProfileStyles.actionRow}>
              {busyAction === "signature" ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="upload" size={15} color={colors.primary} />}
              <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{busyAction === "signature" ? "Uploading…" : "Update signature"}</Text>
            </Pressable>
          </View>

          <View style={[sectionStyle, { borderBottomWidth: 0 }]}>
            <Text style={[providerProfileStyles.sectionTitle, { color: colors.mutedForeground }]}>PORTFOLIO</Text>
            <Text style={[providerProfileStyles.portfolioText, { color: colors.foreground }]}>
              {selectedConsultant?.portfolio || "No portfolio information has been added."}
            </Text>
            <Text style={[providerProfileStyles.eyebrow, { color: colors.mutedForeground, marginTop: 16, marginBottom: 8 }]}>PHOTOS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {portfolioPhotos.map((photo) => (
                <Pressable key={photo.id} onPress={() => setSelectedPortfolioPhoto(photo)}>
                  <Image source={{ uri: absoluteFileUrl(photo.url) }} style={providerProfileStyles.portfolioPhoto} />
                </Pressable>
              ))}
              <Pressable
                onPress={() => void addPortfolioPhoto()}
                disabled={busyAction === "portfolio"}
                style={[providerProfileStyles.portfolioAdd, { borderColor: colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Add portfolio photo"
              >
                {busyAction === "portfolio" ? <ActivityIndicator color={colors.primary} /> : <Feather name="plus" size={22} color={colors.primary} />}
              </Pressable>
            </ScrollView>
          </View>

          <View style={providerProfileStyles.footerLinks}>
            <ProfileLink icon="calendar" title="Availability" subtitle="Weekly hours, pause consultations" colors={colors} onPress={() => router.push("/availability" as never)} />
            <ProfileLink icon="lock" title="Change Password" colors={colors} onPress={() => router.push("/change-password" as never)} />
            <ProfileLink icon="help-circle" title="Help & Support" colors={colors} onPress={() => Alert.alert("Help & Support", "Contact support through your Perfusion administrator.")} />
          </View>
          <Pressable onPress={doLogout} disabled={loggingOut} style={providerProfileStyles.logoutArea}>
            <Text style={[providerProfileStyles.logoutText, { color: colors.mutedForeground }]}>{loggingOut ? "Logging out…" : "Log Out"}</Text>
          </Pressable>
        </>
      )}
      <Modal visible={!!selectedPortfolioPhoto} transparent animationType="fade" onRequestClose={() => setSelectedPortfolioPhoto(null)}>
        <View style={providerProfileStyles.photoModalBackdrop}>
          <View style={[providerProfileStyles.photoModal, { backgroundColor: colors.card }]}>
            <View style={providerProfileStyles.modalHeading}>
              <Text style={[providerProfileStyles.modalTitle, { color: colors.foreground }]} numberOfLines={1}>
                {selectedPortfolioPhoto?.filename || "Portfolio photo"}
              </Text>
              <Pressable onPress={() => setSelectedPortfolioPhoto(null)} accessibilityLabel="Close photo"><Feather name="x" size={22} color={colors.mutedForeground} /></Pressable>
            </View>
            {selectedPortfolioPhoto && <Image source={{ uri: absoluteFileUrl(selectedPortfolioPhoto.url) }} resizeMode="contain" style={providerProfileStyles.photoPreview} />}
            {selectedPortfolioPhoto && <Pressable onPress={() => deletePortfolioPhoto(selectedPortfolioPhoto)} style={[providerProfileStyles.deletePhoto, { borderColor: colors.destructive }]}>
              <Feather name="trash-2" size={16} color={colors.destructive} />
              <Text style={{ color: colors.destructive, fontFamily: "Inter_600SemiBold" }}>Delete photo</Text>
            </Pressable>}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ProfileSection({
  title,
  colors,
  style,
  children,
}: {
  title: string;
  colors: ProfileColors;
  style: any;
  children: React.ReactNode;
}) {
  return (
    <View style={style}>
      <Text style={[providerProfileStyles.sectionTitle, { color: colors.mutedForeground }]}>{title}</Text>
      {children}
    </View>
  );
}

function ProfileValue({
  label,
  value,
  colors,
  locked = false,
  last = false,
}: {
  label: string;
  value?: string;
  colors: ProfileColors;
  locked?: boolean;
  last?: boolean;
}) {
  if (!value) return null;
  return (
    <View style={[providerProfileStyles.valueRow, { borderBottomColor: colors.border }, last && { borderBottomWidth: 0 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 }}>
        {locked && <Feather name="lock" size={11} color={colors.mutedForeground} />}
        <Text style={[providerProfileStyles.valueLabel, { color: colors.mutedForeground }]}>{label}</Text>
      </View>
      <Text style={[providerProfileStyles.valueText, { color: locked ? colors.mutedForeground : colors.foreground }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function ProfileLink({
  icon,
  title,
  subtitle,
  colors,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  colors: ProfileColors;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[providerProfileStyles.linkRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
      <View style={[providerProfileStyles.linkIcon, { backgroundColor: colors.background }]}>
        <Feather name={icon} size={15} color={colors.foreground} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[providerProfileStyles.linkTitle, { color: colors.foreground }]}>{title}</Text>
        {subtitle && <Text style={[providerProfileStyles.linkSubtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
      <Feather name="chevron-right" size={17} color={colors.mutedForeground} />
    </Pressable>
  );
}

function ProviderTextInput({
  label,
  value,
  onChangeText,
  colors,
  secureTextEntry = false,
  multiline = false,
  keyboardType = "default",
  error,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  colors: ProfileColors;
  secureTextEntry?: boolean;
  multiline?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad" | "numeric" | "decimal-pad";
  error?: string;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[providerProfileStyles.inputLabel, { color: colors.foreground }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={label}
        placeholderTextColor={colors.mutedForeground}
        autoCapitalize={keyboardType === "email-address" ? "none" : "sentences"}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        keyboardType={keyboardType}
        style={[
          providerProfileStyles.input,
          multiline && providerProfileStyles.multilineInput,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.border },
        ]}
      />
      {!!error && <Text style={{ color: colors.destructive, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: designTokens.spacing.gutter,
    gap: designTokens.spacing.lg,
  },
  brandRow: { alignItems: "flex-start", marginBottom: 0 },
  avatarSection: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 24,
    borderRadius: designTokens.radius.hero,
    shadowColor: designTokens.shadow.card.color,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  avatarLarge: {
    width: 84,
    height: 84,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  avatarInitial: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
  },
  userName: {
    fontSize: 21,
    fontFamily: "Sora_700Bold",
    letterSpacing: -0.3,
  },
  rolePill: {
    paddingHorizontal: 14,
    minHeight: 32,
    paddingVertical: 6,
    borderRadius: designTokens.radius.pill,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  roleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    minHeight: 32,
    paddingVertical: 6,
    borderRadius: designTokens.radius.pill,
    borderWidth: 1,
  },
  pendingText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  card: {
    borderRadius: designTokens.radius.card,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: designTokens.shadow.card.color,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Sora_600SemiBold",
    padding: 16,
    paddingBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 60,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  rowContent: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rowValue: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: designTokens.radius.pill,
    borderWidth: 1,
  },
  logoutText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  version: {
    textAlign: "center",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});

const providerProfileStyles = StyleSheet.create({
  pageHeading: { paddingHorizontal: designTokens.spacing.gutter, paddingBottom: 8, gap: 14 },
  pageTitle: { fontSize: 22, fontFamily: "Sora_600SemiBold", letterSpacing: -0.3 },
  centerState: { minHeight: 220, alignItems: "center", justifyContent: "center", gap: 12 },
  selectorWrap: { paddingHorizontal: designTokens.spacing.gutter, paddingBottom: 4, gap: 8 },
  selector: { minHeight: 44, borderWidth: 1, borderRadius: designTokens.radius.pill, paddingHorizontal: 14, paddingVertical: 8, justifyContent: "center" },
  hero: { marginHorizontal: designTokens.spacing.gutter, alignItems: "center", paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, borderWidth: 1, borderRadius: designTokens.radius.hero, position: "relative", shadowColor: designTokens.shadow.card.color, shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
  avatarWrap: { position: "relative", marginBottom: 10 },
  avatar: { width: 84, height: 84, borderRadius: 42 },
  cameraButton: { position: "absolute", width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: designTokens.color.card, right: -4, bottom: -4, alignItems: "center", justifyContent: "center" },
  editButton: { position: "absolute", right: 16, top: 16, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  heroName: { fontSize: 19, fontFamily: "Sora_600SemiBold", textAlign: "center", letterSpacing: -0.2 },
  heroSub: { fontSize: 13, textAlign: "center", marginTop: 3 },
  verificationBadge: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32, paddingHorizontal: 12, paddingVertical: 6, borderRadius: designTokens.radius.pill, marginTop: 10 },
  section: { marginHorizontal: designTokens.spacing.gutter, marginTop: designTokens.spacing.md, paddingHorizontal: 16, paddingVertical: 16, borderWidth: 1, borderRadius: designTokens.radius.card, shadowColor: designTokens.shadow.card.color, shadowOpacity: 0.1, shadowRadius: 12, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  sectionTitle: { fontSize: 11, fontFamily: "Sora_600SemiBold", letterSpacing: 0.4, marginBottom: 10 },
  valueRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  valueLabel: { fontSize: 13, flexShrink: 0 },
  valueText: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right", flexShrink: 1 },
  docRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
  docIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  docName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyCopy: { fontSize: 13, lineHeight: 19 },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 12, minHeight: 44 },
  signatureImage: { width: "100%", height: 78, borderRadius: 10 },
  signatureEmpty: { height: 78, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, alignItems: "center", justifyContent: "center", gap: 4 },
  portfolioPhoto: { width: 72, height: 72, borderRadius: designTokens.radius.small, backgroundColor: designTokens.color.plumTint },
  portfolioAdd: { width: 72, height: 72, borderRadius: designTokens.radius.small, borderWidth: 1.5, borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  portfolioText: { fontSize: 14, lineHeight: 21 },
  eyebrow: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.35 },
  footerLinks: { marginTop: 6, gap: 8 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 11, minHeight: 60, marginHorizontal: 16, paddingHorizontal: 16, borderWidth: 1, borderRadius: designTokens.radius.medium, shadowColor: designTokens.shadow.card.color, shadowOpacity: 0.07, shadowRadius: 9, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  linkIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  linkTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  linkSubtitle: { fontSize: 11, marginTop: 2 },
  logoutArea: { alignItems: "center", paddingTop: 15, paddingHorizontal: 24 },
  logoutText: { fontSize: 12, fontFamily: "Inter_600SemiBold", paddingVertical: 6 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.38)" },
  passwordModal: { borderTopLeftRadius: designTokens.radius.sheet, borderTopRightRadius: designTokens.radius.sheet, padding: 22, paddingBottom: 34 },
  modalHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
  modalTitle: { fontSize: 20, fontFamily: "Sora_600SemiBold" },
  inputLabel: { fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, fontFamily: "Inter_400Regular" },
  multilineInput: { minHeight: 100, paddingTop: 11, textAlignVertical: "top" },
  saveButton: { minHeight: 52, borderRadius: designTokens.radius.pill, alignItems: "center", justifyContent: "center", marginTop: 5 },
  saveButtonText: { color: designTokens.color.card, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  inlineAction: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "center" },
  photoModalBackdrop: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "rgba(0,0,0,0.62)" },
  photoModal: { borderRadius: 16, padding: 16 },
  photoPreview: { width: "100%", height: 360, borderRadius: 10 },
  deletePhoto: { marginTop: 12, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 10 },
});
