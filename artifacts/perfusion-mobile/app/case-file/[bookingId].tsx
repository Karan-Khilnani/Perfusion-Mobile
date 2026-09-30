import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { VideoView, useVideoPlayer } from "expo-video";
import { File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppAlert } from "@/components/AppAlert";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import {
  CaseFileAttachmentPreview,
  CaseFileMediaViewer,
} from "@/components/CaseFileMedia";
import { SkeletonBlock, StateCard } from "@/components/SharedStates";
import { BRAND_GRADIENT, designTokens } from "@/constants/designTokens";
import { cardShadow } from "@/constants/nativeShadows";
import {
  type AttachmentCategory,
  type AttachmentDraft,
  type AttachmentSource,
  pickCaseFileAttachment,
  uploadCaseFileAttachment,
  isVideoDraft,
} from "@/lib/case-file-attachments";
import {
  Advisory,
  CaseFileAggregate,
  CaseFileCallbackDevice,
  CaseFileMessage,
  Vital,
  isSeekerRole,
  statusPresentation,
} from "@/lib/mobile-models";

const CATEGORY_LABELS: { label: string; value: AttachmentCategory }[] = [
  { label: "Lab", value: "lab" },
  { label: "Radiology", value: "radiology" },
  { label: "Treatment Chart", value: "treatment_chart" },
  { label: "General", value: "general" },
];

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || "Request failed");
  }
  return response.json();
}

function getComorbidityEntries(value: string | null | undefined): string[] {
  return (value || "")
    .split(/\r\n|\n|\r/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function CaseFileScreen() {
  const { bookingId, focus } = useLocalSearchParams<{ bookingId: string; focus?: string }>();
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const seeker = isSeekerRole(user?.role);
  const [message, setMessage] = useState("");
  const [sheet, setSheet] = useState<"summary" | "profile" | "vitals" | "add-vitals" | "advisory" | "trail" | "source" | "attach" | null>(
    focus === "summary" ? "summary" : focus === "advisory" ? (seeker ? "trail" : "advisory") : null,
  );
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [attachmentCategory, setAttachmentCategory] = useState<AttachmentCategory | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [viewerAttachment, setViewerAttachment] = useState<NonNullable<CaseFileMessage["attachment"]> | null>(null);
  const [startingCall, setStartingCall] = useState<"voice" | "video" | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [callbackPickerOpen, setCallbackPickerOpen] = useState(false);
  const callbackDevices = useQuery<Array<{ id: string; deviceName: string; phoneNumber: string; installationId: string | null }>>({
    queryKey: ["mobile-callback-devices"],
    enabled: seeker,
    queryFn: async () => {
      const result = await requestJson("/api/profile/callback-devices");
      if (!Array.isArray(result)) throw new Error("Callback device directory is invalid.");
      return result;
    },
  });
  const callbackDeviceMutation = useMutation({
    mutationFn: (deviceId: string) => requestJson<CaseFileCallbackDevice>(`/api/bookings/${encodeURIComponent(bookingId)}/callback-device`, {
      method: "PUT",
      body: JSON.stringify({ deviceId }),
    }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["case-file", bookingId] }),
        queryClient.invalidateQueries({ queryKey: ["mobile-callback-device-reminders"] }),
      ]);
    },
  });

  const startCall = async (callType: "voice" | "video") => {
    if (startingCall) return;
    setStartingCall(callType);
    setCallError(null);
    try {
      const result = await requestJson<{ session: { sessionGeneration: string } }>(`/api/call/ring/${bookingId}`, {
        method: "POST",
        body: JSON.stringify({ callType }),
      });
      router.push(`/call/${bookingId}?mode=${callType}&generation=${result.session.sessionGeneration}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not start the call.";
      setCallError(reason);
      if (Platform.OS !== "web") AppAlert.alert("Cannot start call", reason);
    } finally {
      setStartingCall(null);
    }
  };

  const chooseAttachment = async (source: AttachmentSource) => {
    setSheet(null);
    setAttachmentError(null);
    try {
      // Native image/document pickers must wait until the presenting sheet has dismissed.
      // On web, retain the click gesture so the browser permits the file chooser.
      if (Platform.OS !== "web") await new Promise((resolve) => setTimeout(resolve, 350));
      const picked = await pickCaseFileAttachment(source);
      if (!picked) return;
      setAttachment(picked);
      setAttachmentCategory(null);
      setSheet("attach");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not open the file picker.";
      setAttachmentError(message);
      setSheet("source");
      if (Platform.OS !== "web" && message.includes("device settings")) {
        AppAlert.alert("Permission needed", message, [
          { text: "Not now", style: "cancel" },
          { text: "Open Settings", onPress: () => void Linking.openSettings() },
        ]);
      }
    }
  };

  const openCaseFileAttachment = async (attachmentId: string, disposition: "inline" | "attachment", filename?: string | null) => {
    if (openingAttachmentId) return;
    setOpeningAttachmentId(attachmentId);
    try {
      const { url } = await requestJson<{ url: string }>(
        `/api/bookings/${encodeURIComponent(bookingId)}/case-file/attachments/${encodeURIComponent(attachmentId)}/signed-url?disposition=${disposition}`,
      );
      if (disposition === "attachment" && Platform.OS !== "web" && await Sharing.isAvailableAsync()) {
        const safeName = (filename || `case-file-${attachmentId}`).replace(/[^a-zA-Z0-9._-]/g, "_");
        const local = await ExpoFile.downloadFileAsync(url, new ExpoFile(Paths.cache, `${Date.now()}-${safeName}`));
        await Sharing.shareAsync(local.uri, { dialogTitle: "Save or share original attachment" });
      } else {
        await Linking.openURL(url);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : "The file could not be opened.";
      AppAlert.alert(disposition === "inline" ? "Could not open file" : "Could not download file", reason);
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const sendAttachment = async () => {
    if (!attachment || (seeker && !attachmentCategory) || uploading) return;
    setUploading(true);
    setAttachmentError(null);
    try {
      await uploadCaseFileAttachment(bookingId, attachment, seeker ? attachmentCategory! : "uncategorized");
      setSheet(null);
      setAttachment(null);
      setAttachmentCategory(null);
      queryClient.invalidateQueries({ queryKey: ["case-file-messages", bookingId] });
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "Could not upload the file.");
    } finally {
      setUploading(false);
    }
  };

  const aggregate = useQuery<CaseFileAggregate>({
    queryKey: ["case-file", bookingId],
    queryFn: () => requestJson(`/api/bookings/${bookingId}/case-file`),
    enabled: !!bookingId,
    refetchInterval: 15_000,
  });
  const messages = useQuery<{ messages: CaseFileMessage[]; nextCursor?: string | null }>({
    queryKey: ["case-file-messages", bookingId],
    queryFn: () => requestJson(`/api/bookings/${bookingId}/case-file/messages?limit=100`),
    enabled: !!bookingId,
    refetchInterval: 15_000,
  });
  const vitals = useQuery<Vital[]>({
    queryKey: ["case-file-vitals", bookingId],
    queryFn: () => requestJson(`/api/bookings/${bookingId}/case-file/vitals`),
    enabled: !!bookingId,
    refetchInterval: 15_000,
  });
  const advisories = useQuery<Advisory[]>({
    queryKey: ["case-file-advisories", bookingId],
    queryFn: () => requestJson(`/api/bookings/${bookingId}/case-file/advisories`),
    enabled: !!bookingId,
    refetchInterval: 15_000,
  });

  const sendMessage = useMutation({
    mutationFn: (body: string) => requestJson(`/api/bookings/${bookingId}/case-file/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["case-file-messages", bookingId] });
    },
  });

  const booking = aggregate.data?.booking;
  const capabilities = aggregate.data?.capabilities;
  const sortedMessages = useMemo(
    () => [...(messages.data?.messages || [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [messages.data?.messages],
  );

  if (aggregate.isLoading) {
    return <StateView loading label="Opening Case File…" />;
  }
  if (aggregate.isError || !booking || !capabilities) {
    return <StateView label="This Case File could not be opened." retry={() => aggregate.refetch()} />;
  }

  const caseFile = aggregate.data!;
  const comorbidityEntries = getComorbidityEntries(caseFile.summary.comorbidities);
  const status = booking.consultationLifecycleAvailable === false
    ? { label: "Schedule unavailable", dot: palette.warning, text: palette.warning }
    : statusPresentation(booking.status, {
        success: palette.success,
        terminal: palette.terminal,
        warning: palette.warning,
        quiet: palette.quiet,
        blue: palette.blue,
      });
  const latest = caseFile.latestVitals;
  const staleness = caseFile.latestVitalsFreshness || "stale";
  const freshnessColor = staleness === "fresh" ? palette.success : staleness === "aging" ? palette.warning : palette.primary;
  const gender = booking.patientGender ? booking.patientGender.slice(0, 1).toUpperCase() : "";

  return (
    <KeyboardAvoidingView behavior="padding" style={[styles.screen, { backgroundColor: palette.conversationBackground }]}>
      <LinearGradient
        colors={BRAND_GRADIENT}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: Platform.OS === "web" ? 68 : insets.top + 8 }]}
      >
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
          <Feather name="arrow-left" size={21} color="#FFFFFF" />
        </Pressable>
        <Pressable style={styles.identity} onPress={() => setSheet("summary")}>
          <View style={styles.patientBadge}>
            <Text style={styles.patientBadgeText}>
              {booking.patientName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("")}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.patientName} numberOfLines={1}>{booking.patientName}</Text>
            <Text style={styles.patientMeta} numberOfLines={1}>
              {booking.serviceName} · {booking.patientAge}{gender}
            </Text>
            <View style={styles.headerStatus}>
              <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
              <Text style={[styles.headerStatusText, { color: "#FFFFFF" }]}>{status.label}</Text>
            </View>
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable disabled={!capabilities.callsEnabled || !!startingCall} onPress={() => startCall("voice")} accessibilityLabel="Call care team" style={[styles.headerAction, { opacity: capabilities.callsEnabled && !startingCall ? 1 : 0.45 }]}>
            <Feather name="phone" size={18} color="#FFFFFF" />
          </Pressable>
          <Pressable disabled={!capabilities.videoEnabled || !!startingCall} onPress={() => startCall("video")} accessibilityLabel="Video call care team" style={[styles.headerAction, { opacity: capabilities.videoEnabled && !startingCall ? 1 : 0.45 }]}>
            <Feather name="video" size={19} color="#FFFFFF" />
          </Pressable>
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: 12, paddingTop: 9, paddingBottom: 8, backgroundColor: palette.background }}>
        <CallbackDeviceRow
          assignment={booking.callbackDevice || null}
          canManage={seeker && capabilities.canManageCallbackDevice === true}
          devices={callbackDevices.data || []}
          loading={callbackDevices.isLoading}
          directoryError={callbackDevices.isError ? (callbackDevices.error instanceof Error ? callbackDevices.error.message : "Could not load callback devices.") : null}
          saving={callbackDeviceMutation.isPending}
          mutationError={callbackDeviceMutation.isError ? (callbackDeviceMutation.error instanceof Error ? callbackDeviceMutation.error.message : "Could not update callback device.") : null}
          pickerOpen={callbackPickerOpen}
          onTogglePicker={() => setCallbackPickerOpen((open) => !open)}
          onRefreshDevices={() => void callbackDevices.refetch()}
          onSelect={(deviceId) => {
            callbackDeviceMutation.mutate(deviceId);
            setCallbackPickerOpen(false);
          }}
        />
      </View>

      {callError && <Text style={[styles.callError, { color: palette.primary, backgroundColor: palette.conversationCard }]} accessibilityRole="alert">{callError}</Text>}

      <View style={[styles.vitalsDock, { backgroundColor: palette.background, borderBottomColor: palette.conversationBorder }]}>
        <View style={styles.vitalsHeadingRow}>
          <View style={styles.vitalsTitle}>
            <View style={[styles.freshness, { backgroundColor: freshnessColor }]} />
            <Text style={[styles.eyebrow, { color: palette.conversationMuted }]}>LATEST VITALS</Text>
          </View>
          <View style={styles.vitalHeaderActions}>
            <Pressable onPress={() => setSheet("vitals")} style={styles.chartButton}>
              <Text style={[styles.chartLink, { color: palette.primary }]}>Full chart</Text>
            </Pressable>
            {capabilities.canAddVitals && (
              <Pressable onPress={() => setSheet("add-vitals")} style={styles.addVital} accessibilityLabel="Add vitals">
                <LinearGradient colors={BRAND_GRADIENT} style={styles.addVitalGradient}>
                  <Feather name="plus" size={19} color="#FFFFFF" />
                </LinearGradient>
              </Pressable>
            )}
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.vitalStrip}>
          <VitalCell label="BP" value={latest?.systolicBp ? `${latest.systolicBp}/${latest.diastolicBp || "—"}` : "—"} detail="mmHg" accent={designTokens.color.coral} tint={designTokens.color.coralTint} />
          <VitalCell label="HR" value={latest?.heartRate != null ? `${latest.heartRate}` : "—"} detail="bpm" accent={designTokens.color.plum} tint={designTokens.color.plumTint} />
          <VitalCell label="I/O" value={latest?.intake != null || latest?.output != null ? `${(latest?.intake || 0) - (latest?.output || 0)} mL` : "—"} detail={`UO ${latest?.hourlyUrineOutput ?? "—"} mL/hr`} accent={designTokens.color.green} tint={designTokens.color.greenTint} />
          <VitalCell label="RR" value={latest?.respiratoryRate != null ? `${latest.respiratoryRate}` : "—"} detail="/min" accent={designTokens.color.blue} tint={designTokens.color.blueTint} />
          <VitalCell label="GCS" value={latest?.gcs != null ? `${latest.gcs}/15` : "—"} detail={latest?.observedAt ? new Date(latest.observedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "Not recorded"} accent={designTokens.color.gold} tint={designTokens.color.goldTint} />
        </ScrollView>
      </View>

      <FlatList
        data={sortedMessages}
        inverted
        keyExtractor={(item) => item.id}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={sortedMessages.length > 0 ? (
          <View style={styles.dateDivider}>
            <View style={[styles.dateLine, { backgroundColor: palette.conversationBorder }]} />
            <Text style={[styles.dateText, { color: palette.conversationMuted }]}>
              {new Date(sortedMessages[sortedMessages.length - 1].createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }).toUpperCase()}
            </Text>
            <View style={[styles.dateLine, { backgroundColor: palette.conversationBorder }]} />
          </View>
        ) : null}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            bookingId={bookingId}
            own={item.senderUserId === user?.id}
            onAdvisory={() => setSheet("trail")}
            onOpenAttachment={setViewerAttachment}
          />
        )}
        ListHeaderComponent={sortedMessages.length === 0 ? (
          <View style={styles.emptyChat}>
            <Feather name="message-circle" size={28} color={palette.mutedForeground} />
            <Text style={[styles.emptyChatTitle, { color: palette.foreground }]}>No messages yet</Text>
            <Text style={[styles.emptyChatText, { color: palette.mutedForeground }]}>
              {capabilities.readOnly ? "This Case File remains available as a permanent read-only record." : "Start the clinical conversation here."}
            </Text>
          </View>
        ) : null}
      />

      {!capabilities.readOnly && (
        <View style={[styles.composer, { paddingBottom: Platform.OS === "web" ? 34 : Math.max(insets.bottom, 10), backgroundColor: palette.conversationCard, borderTopColor: palette.conversationBorder }]}>
          {capabilities.canAttach && (
            <Pressable onPress={() => setSheet("source")} style={[styles.composeIcon, { backgroundColor: palette.conversationSoft }]} accessibilityLabel="Attach clinical file">
              <Feather name="paperclip" size={21} color={palette.foreground} />
            </Pressable>
          )}
          {capabilities.canComposeAdvisory && (
            <Pressable onPress={() => setSheet("advisory")} style={[styles.composeIcon, { backgroundColor: designTokens.color.goldTint }]} accessibilityLabel="Add Clinical Advisory">
              <Feather name="edit-3" size={20} color={palette.foreground} />
            </Pressable>
          )}
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Message care team…"
            placeholderTextColor={palette.mutedForeground}
            style={[styles.messageInput, { color: palette.foreground, backgroundColor: palette.conversationBackground, borderColor: palette.conversationBorder }]}
            multiline
          />
          <Pressable
            disabled={!message.trim() || sendMessage.isPending}
            onPress={() => sendMessage.mutate(message.trim())}
            style={({ pressed }) => [styles.send, { opacity: !message.trim() || sendMessage.isPending ? 0.45 : pressed ? 0.84 : 1 }]}
          >
            <LinearGradient colors={BRAND_GRADIENT} style={styles.sendGradient}>
              {sendMessage.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="arrow-up" size={19} color="#FFFFFF" />}
            </LinearGradient>
          </Pressable>
        </View>
      )}

      <CaseFileSheet
        type={sheet}
        onClose={() => {
          if (uploading) return;
          if (sheet === "attach") {
            setAttachment(null);
            setAttachmentCategory(null);
            setAttachmentError(null);
          }
          setSheet(null);
        }}
        onChooseAttachment={chooseAttachment}
        attachment={attachment}
        attachmentCategory={attachmentCategory}
        onCategoryChange={setAttachmentCategory}
        attachmentError={attachmentError}
        uploading={uploading}
        onSendAttachment={sendAttachment}
        seeker={seeker}
        aggregate={caseFile}
        vitals={vitals.data || []}
        advisories={advisories.data || caseFile.advisories || []}
        bookingId={bookingId}
        onRefresh={() => {
          queryClient.invalidateQueries({ queryKey: ["case-file", bookingId] });
          queryClient.invalidateQueries({ queryKey: ["case-file-vitals", bookingId] });
          queryClient.invalidateQueries({ queryKey: ["case-file-advisories", bookingId] });
          queryClient.invalidateQueries({ queryKey: ["case-file-messages", bookingId] });
        }}
        onOpenProfile={() => setSheet("profile")}
      />
      <CaseFileMediaViewer
        visible={!!viewerAttachment}
        attachment={viewerAttachment}
        bookingId={bookingId}
        downloading={openingAttachmentId === viewerAttachment?.id}
        onClose={() => setViewerAttachment(null)}
        onDownload={() => {
          if (viewerAttachment) {
            void openCaseFileAttachment(
              viewerAttachment.id,
              "attachment",
              viewerAttachment.originalFilename,
            );
          }
        }}
      />
    </KeyboardAvoidingView>
  );
}

function CallbackDeviceRow({
  assignment,
  canManage,
  devices,
  loading,
  directoryError,
  saving,
  mutationError,
  pickerOpen,
  onTogglePicker,
  onRefreshDevices,
  onSelect,
}: {
  assignment: CaseFileCallbackDevice | null;
  canManage: boolean;
  devices: Array<{ id: string; deviceName: string; phoneNumber: string; installationId: string | null }>;
  loading: boolean;
  directoryError: string | null;
  saving: boolean;
  mutationError: string | null;
  pickerOpen: boolean;
  onTogglePicker: () => void;
  onRefreshDevices: () => void;
  onSelect: (deviceId: string) => void;
}) {
  const palette = useColors();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!assignment?.due || !canManage) {
      opacity.setValue(1);
      return;
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 0.28, duration: 550, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [assignment?.due, canManage, opacity]);

  const currentDeviceName = assignment?.deviceName || "No callback device selected";
  const dueLabel = assignment?.dueAt
    ? `Confirmation due ${new Date(assignment.dueAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
    : "Confirmation required";

  return (
    <View style={{ borderWidth: 1, borderColor: palette.border, backgroundColor: palette.background, borderRadius: 14, padding: 13, gap: 9 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
        <Feather name="phone-call" size={17} color={palette.primary} />
        <Text style={{ flex: 1, color: palette.mutedForeground, fontSize: 10, letterSpacing: 0.5, fontFamily: "Inter_700Bold" }}>CALLBACK DEVICE</Text>
        <Text numberOfLines={1} style={{ color: palette.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", maxWidth: "60%" }}>{currentDeviceName}</Text>
      </View>
      {canManage && loading && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <ActivityIndicator size="small" color={palette.primary} />
          <Text style={{ color: palette.mutedForeground, fontSize: 11 }}>Loading callback device directory…</Text>
        </View>
      )}
      {canManage && assignment?.confirmedAt && (
        <Text style={{ color: palette.mutedForeground, fontSize: 11 }}>
          Last confirmed {new Date(assignment.confirmedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </Text>
      )}
      {canManage && assignment?.due && (
        <Animated.Text style={{ color: palette.warning, fontSize: 12, fontFamily: "Inter_700Bold", opacity }}>{dueLabel} · please reconfirm</Animated.Text>
      )}
      {canManage && (
        <>
          <Pressable
            onPress={onTogglePicker}
            disabled={saving || loading}
            style={{ minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card }}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator size="small" color={palette.primary} /> : <Feather name={assignment?.deviceId ? "check-circle" : "edit-2"} size={15} color={palette.primary} />}
            <Text style={{ color: palette.primary, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
              {saving ? "Saving…" : assignment?.deviceId ? "Change or confirm device" : "Choose callback device"}
            </Text>
          </Pressable>
          {!!mutationError && <Text style={{ color: palette.destructive, fontSize: 12 }} accessibilityRole="alert">{mutationError}</Text>}
          {pickerOpen && (
            <View style={{ gap: 7 }}>
              {loading ? <ActivityIndicator color={palette.primary} /> : directoryError ? (
                <View style={{ gap: 5 }}>
                  <Text style={{ color: palette.destructive, fontSize: 12 }}>{directoryError}</Text>
                  <Pressable onPress={onRefreshDevices}><Text style={{ color: palette.primary }}>Retry</Text></Pressable>
                </View>
              ) : devices.length ? devices.map((device) => (
                <Pressable
                  key={device.id}
                  disabled={saving}
                  onPress={() => onSelect(device.id)}
                  style={{ padding: 11, borderRadius: 9, backgroundColor: device.id === assignment?.deviceId ? `${palette.primary}12` : palette.card, borderColor: device.id === assignment?.deviceId ? palette.primary : palette.border, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 }}
                  accessibilityRole="button"
                >
                  <Feather name={device.id === assignment?.deviceId ? "check-circle" : "smartphone"} size={15} color={device.id === assignment?.deviceId ? palette.primary : palette.mutedForeground} />
                  <Text style={{ color: palette.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{device.deviceName}</Text>
                </Pressable>
              )) : (
                <View style={{ gap: 6 }}>
                  <Text style={{ color: palette.mutedForeground, fontSize: 12 }}>No registered devices. Add one to your directory first.</Text>
                  <Pressable onPress={() => router.push("/callback-device")}><Text style={{ color: palette.primary, fontFamily: "Inter_600SemiBold" }}>Manage devices</Text></Pressable>
                </View>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function VitalCell({
  label,
  value,
  detail,
  accent,
  tint,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
  tint: string;
}) {
  const palette = useColors();
  return (
    <View style={[styles.vitalCell, { backgroundColor: tint, borderColor: palette.border }]}>
      <Text style={[styles.vitalLabel, { color: accent }]}>{label}</Text>
      <Text style={[styles.vitalValue, { color: palette.foreground }]}>{value}</Text>
      <Text style={[styles.vitalDetail, { color: palette.mutedForeground }]}>{detail}</Text>
    </View>
  );
}

function getVisibleMessageText(message: CaseFileMessage): string {
  const body: unknown = message.body;
  if (message.kind === "attachment") return "";
  const structuredAdvisory =
    message.kind === "clinical_advisory_reference" || message.kind === "advisory";

  if (!structuredAdvisory) {
    return typeof body === "string" ? body : "";
  }

  if (typeof body === "string") {
    const trimmedBody = body.trim();
    if (!trimmedBody) return "";

    try {
      const parsed: unknown = JSON.parse(trimmedBody);
      if (typeof parsed === "string") return parsed;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const narrative = (parsed as { narrative?: unknown }).narrative;
        if (typeof narrative === "string") return narrative;
      }
    } catch {
      // Older advisory references may contain plain narrative text.
      if (!trimmedBody.startsWith("{") && !trimmedBody.startsWith("[")) return body;
    }

    return "";
  }

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const narrative = (body as { narrative?: unknown }).narrative;
    return typeof narrative === "string" ? narrative : "";
  }

  return "";
}

function MessageBubble({
  message,
  bookingId,
  own,
  onAdvisory,
  onOpenAttachment,
}: {
  message: CaseFileMessage;
  bookingId: string;
  own: boolean;
  onAdvisory: () => void;
  onOpenAttachment: (attachment: NonNullable<CaseFileMessage["attachment"]>) => void;
}) {
  const palette = useColors();
  const advisory = message.kind === "advisory";
  const senderLabel = own
    ? "You"
    : message.senderRole === "provider"
      ? "Consultant"
      : "Treating team";
  const time = new Date(message.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const visibleMessageText = getVisibleMessageText(message);
  const bubbleStyle = [
    styles.bubble,
    own && !advisory ? styles.ownBubble : styles.otherBubble,
    advisory && { backgroundColor: palette.advisoryBackground, borderColor: palette.advisoryBorder },
    !advisory && !own && { backgroundColor: palette.conversationCard, borderColor: palette.conversationBorder },
  ];
  const bubbleContent = (
    <>
      {advisory && (
        <View style={styles.advisoryHeading}>
          <Feather name="shield" size={15} color={palette.advisoryForeground} />
          <Text style={[styles.advisoryTitle, { color: palette.advisoryForeground }]}>Clinical Advisory</Text>
          <View style={[styles.signedBadge, { backgroundColor: `${palette.advisoryForeground}18` }]}>
            <Text style={[styles.signedBadgeText, { color: palette.advisoryForeground }]}>SIGNED</Text>
          </View>
        </View>
      )}
      {message.attachment && (
        <CaseFileAttachmentPreview
          attachment={message.attachment}
          bookingId={bookingId}
          onOpen={onOpenAttachment}
        />
      )}
      {!!visibleMessageText && <Text style={[styles.messageText, { color: own && !advisory ? palette.conversationPrimaryForeground : palette.foreground }]}>{visibleMessageText}</Text>}
      {advisory && (
        <View style={styles.advisoryFooter}>
          <Feather name="lock" size={11} color={palette.advisoryForeground} />
          <Text style={[styles.advisoryMeta, { color: palette.advisoryForeground }]}>Permanent signed record · {time}</Text>
          <Text style={[styles.fullAdvisory, { color: palette.advisoryForeground }]}>View full</Text>
        </View>
      )}
       {!advisory && <Text style={[styles.messageTime, { color: own ? palette.conversationPrimaryForeground : palette.conversationMuted }]}>{time}</Text>}
    </>
  );

  return (
    <View style={[styles.messageRow, { alignItems: own ? "flex-end" : "flex-start" }]}>
      {!advisory && (
        <View style={[styles.senderLine, own && styles.senderLineOwn]}>
          {!own && (
            <View style={[styles.senderAvatar, { backgroundColor: palette.conversationSoft }]}>
              <Text style={[styles.senderInitials, { color: palette.conversationPrimary }]}>
                {senderLabel.slice(0, 2).toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={[styles.senderLabel, { color: palette.conversationMuted }]}>
            {senderLabel} · {time}
          </Text>
        </View>
      )}
      <View style={[styles.messageContent, own && styles.messageContentOwn]}>
        {advisory ? (
          <Pressable onPress={onAdvisory} style={bubbleStyle} accessibilityRole="button" accessibilityLabel="View Clinical Advisory">
            {bubbleContent}
          </Pressable>
        ) : own ? (
          <LinearGradient colors={BRAND_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={bubbleStyle}>
            {bubbleContent}
          </LinearGradient>
        ) : (
          <View style={bubbleStyle}>{bubbleContent}</View>
        )}
      </View>
    </View>
  );
}

function CaseFileVideo({ uri, height = 220 }: { uri: string; height?: number }) {
  const player = useVideoPlayer({ uri });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status }) => {
      setFailed(status === "error");
    });
    return () => subscription.remove();
  }, [player]);
  return <View>
    <VideoView player={player} nativeControls allowsFullscreen style={{ width: "100%", height, backgroundColor: "#111" }} />
    {failed && <Text style={{ color: "#DB2841", fontSize: 12, padding: 8 }} accessibilityRole="alert">Playback unavailable. Download the original video to view it.</Text>}
  </View>;
}

function CaseFileSheet({
  type,
  onClose,
  onChooseAttachment,
  attachment,
  attachmentCategory,
  onCategoryChange,
  attachmentError,
  uploading,
  onSendAttachment,
  seeker,
  aggregate,
  vitals,
  advisories,
  bookingId,
  onRefresh,
  onOpenProfile,
}: {
  type: string | null;
  onClose: () => void;
  onChooseAttachment: (source: AttachmentSource) => void;
  attachment: AttachmentDraft | null;
  attachmentCategory: AttachmentCategory | null;
  onCategoryChange: (category: AttachmentCategory) => void;
  attachmentError: string | null;
  uploading: boolean;
  onSendAttachment: () => void;
  seeker: boolean;
  aggregate: CaseFileAggregate;
  vitals: Vital[];
  advisories: Advisory[];
  bookingId: string;
  onRefresh: () => void;
  onOpenProfile: () => void;
}) {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const [advisory, setAdvisory] = useState("");
  const [downloadingAdvisoryId, setDownloadingAdvisoryId] = useState<string | null>(null);
  const [vitalForm, setVitalForm] = useState({ bp: "", hr: "", rr: "", gcs: "", intake: "", output: "", urine: "" });

  const openAdvisoryPdf = async (item: Advisory) => {
    const attachmentId = item.attachmentIds?.[0];
    if (!attachmentId) {
      AppAlert.alert("PDF unavailable", "This Clinical Advisory does not have a PDF attachment.");
      return;
    }
    setDownloadingAdvisoryId(item.id);
    try {
      const { url } = await requestJson<{ url: string }>(
        `/api/bookings/${bookingId}/case-file/attachments/${attachmentId}/signed-url?disposition=inline`,
      );
      await Linking.openURL(url);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Could not open the PDF.";
      AppAlert.alert("Could not open PDF", reason);
    } finally {
      setDownloadingAdvisoryId(null);
    }
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (type === "advisory") {
        return requestJson<Advisory>(`/api/bookings/${bookingId}/case-file/advisories`, { method: "POST", body: JSON.stringify({ narrative: advisory.trim() }) });
      }
      const [systolic, diastolic] = vitalForm.bp.split("/").map((value) => value ? Number(value) : null);
      return requestJson(`/api/bookings/${bookingId}/case-file/vitals`, {
        method: "POST",
        body: JSON.stringify({
          observedAt: new Date().toISOString(),
          systolicBp: systolic,
          diastolicBp: diastolic,
          heartRate: vitalForm.hr ? Number(vitalForm.hr) : null,
          respiratoryRate: vitalForm.rr ? Number(vitalForm.rr) : null,
          gcs: vitalForm.gcs ? Number(vitalForm.gcs) : null,
          intake: vitalForm.intake ? Number(vitalForm.intake) : null,
          output: vitalForm.output ? Number(vitalForm.output) : null,
          hourlyUrineOutput: vitalForm.urine ? Number(vitalForm.urine) : null,
        }),
      });
    },
    onSuccess: (result) => {
      onRefresh();
      onClose();
      setAdvisory("");
      if (type === "advisory") {
        const savedAdvisory = result as Advisory;
        if (savedAdvisory.attachmentIds?.[0]) void openAdvisoryPdf(savedAdvisory);
        else AppAlert.alert("Clinical Advisory saved", "The record was saved, but its PDF is not available.");
      }
    },
  });
  if (!type) return null;
  const title = type === "summary" ? "Clinical Summary" : type === "profile" ? "Patient Profile" : type === "vitals" ? "Vitals · I/O · GCS" : type === "add-vitals" ? "Add Vitals" : type === "advisory" ? "Add Clinical Advisory" : type === "trail" ? "Clinical Advisory" : type === "attach" ? "Review attachment" : "Attach";

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} disabled={uploading} />
        <View style={[styles.sheet, { backgroundColor: palette.card, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={[styles.sheetHeader, { borderBottomColor: palette.border }]}>
            <View>
              <Text style={[styles.sheetTitle, { color: palette.foreground }]}>{title}</Text>
              <Text style={[styles.sheetSubtitle, { color: palette.mutedForeground }]}>{aggregate.booking.patientName}</Text>
            </View>
            <Pressable onPress={onClose} disabled={uploading} style={styles.iconButton}><Feather name="x" size={20} color={palette.foreground} /></Pressable>
          </View>
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            {type === "summary" && (
              <>
                <InfoSection label="ALLERGIES" value={aggregate.summary.allergies} warning />
                <InfoSection label="COMORBIDITIES / PAST ILLNESS" value={aggregate.summary.comorbidities} />
                <InfoSection label="PRESENTING COMPLAINT" value={aggregate.summary.presentingComplaint} />
                <InfoSection label="PRESENT ILLNESS" value={aggregate.summary.presentIllness} />
                <Text style={[styles.eyebrow, { color: palette.mutedForeground, marginTop: 6 }]}>CLINICAL DETAILS</Text>
                <InfoSection label="EXAMINATION" value={aggregate.summary.examination} />
                <InfoSection label="INVESTIGATIONS" value={aggregate.summary.investigations} />
                <InfoSection label="PROVISIONAL DIAGNOSIS" value={aggregate.summary.workingDiagnosis} />
                <InfoSection label="CLINICAL SUMMARY" value={aggregate.summary.clinicalSummary} />
                <Pressable onPress={onOpenProfile} style={[styles.primaryOutline, { borderColor: palette.border }]}>
                  <Text style={[styles.primaryOutlineText, { color: palette.foreground }]}>View Patient Profile & Past Records</Text>
                  <Feather name="arrow-right" size={17} color={palette.foreground} />
                </Pressable>
              </>
            )}
            {type === "profile" && (
              <>
                <InfoSection label="ALLERGIES" value={aggregate.profile.allergies} warning />
                <InfoSection label="PATIENT-WIDE COMORBIDITIES" value={aggregate.profile.comorbidities} />
                <InfoSection label="BASELINE MEDICATIONS" value={aggregate.profile.baselineMedications} />
                <InfoSection label="BASELINE PARAMETERS" value={aggregate.profile.baselineParameters} />
                <InfoSection label="PAST ADMISSIONS" value={aggregate.profile.pastAdmissions} />
                <InfoSection label="EMERGENCY CONTACT" value={aggregate.profile.emergencyContact} />
              </>
            )}
            {type === "vitals" && (
              <View style={[styles.flowsheet, { borderColor: palette.border }]}>
                <View style={[styles.flowRow, styles.flowHeader, { backgroundColor: palette.background }]}>
                  {["TIME", "BP", "HR", "RR", "GCS", "I/O · UO/hr"].map((label) => <Text key={label} style={[styles.flowHead, { color: palette.mutedForeground }]}>{label}</Text>)}
                </View>
                {vitals.length === 0 ? <Text style={[styles.noData, { color: palette.mutedForeground }]}>No vitals recorded.</Text> : vitals.map((item) => (
                  <View key={item.id} style={[styles.flowRow, { borderTopColor: palette.border }]}>
                    <Text style={[styles.flowCell, { color: palette.foreground }]}>{new Date(item.observedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</Text>
                    <Text style={[styles.flowCell, { color: palette.foreground }]}>{item.systolicBp ? `${item.systolicBp}/${item.diastolicBp || "—"}` : "—"}</Text>
                    <Text style={[styles.flowCell, { color: palette.foreground }]}>{item.heartRate ?? "—"}</Text>
                    <Text style={[styles.flowCell, { color: palette.foreground }]}>{item.respiratoryRate ?? "—"}</Text>
                    <Text style={[styles.flowCell, { color: palette.foreground }]}>{item.gcs ?? "—"}</Text>
                    <Text style={[styles.flowCell, { color: palette.foreground }]}>{item.intake != null || item.output != null ? `${(item.intake || 0) - (item.output || 0)} · ${item.hourlyUrineOutput ?? "—"}` : "—"}</Text>
                  </View>
                ))}
              </View>
            )}
            {type === "trail" && (
              <>
                <Text style={[styles.disclaimer, { color: palette.mutedForeground, borderColor: palette.border }]}>
                  This Clinical Advisory reflects clinical opinion and support provided by Perfusion&apos;s consulting physician to the treating team. Treatment and prescribing responsibility remains with the treating physicians at the treating hospital.
                </Text>
                {advisories.map((item) => (
                  <View key={item.id} style={[styles.trailEntry, { borderLeftColor: palette.quiet }]}>
                    <Text style={[styles.trailTime, { color: palette.mutedForeground }]}>{new Date(item.authoredAt).toLocaleString("en-IN")}</Text>
                    <Text style={[styles.trailText, { color: palette.foreground }]}>{item.narrative}</Text>
                    {item.attachmentIds?.[0] && (
                      <Pressable
                        disabled={downloadingAdvisoryId === item.id}
                        onPress={() => void openAdvisoryPdf(item)}
                        accessibilityRole="button"
                        accessibilityLabel="Download Clinical Advisory PDF"
                        testID={`download-advisory-pdf-${item.id}`}
                        style={({ pressed }) => ({
                          alignSelf: "flex-start",
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 7,
                          marginTop: 10,
                          paddingVertical: 7,
                          paddingHorizontal: 10,
                          borderRadius: 9,
                          backgroundColor: pressed ? palette.background : palette.conversationBackground,
                          borderWidth: 1,
                          borderColor: palette.conversationBorder,
                          opacity: downloadingAdvisoryId === item.id ? 0.65 : 1,
                        })}
                      >
                        {downloadingAdvisoryId === item.id
                          ? <ActivityIndicator size="small" color={palette.foreground} />
                          : <Feather name="download" size={15} color={palette.foreground} />}
                        <Text style={{ color: palette.foreground, fontSize: 12, fontWeight: "600" }}>Download Clinical Advisory PDF</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </>
            )}
            {type === "advisory" && (
              <>
                <InfoSection label="PROVISIONAL DIAGNOSIS · (Provided by Seeker Hospital)" value={aggregate.summary.workingDiagnosis} />
                <InfoSection label="PRESENTING COMPLAINT · (Provided by Seeker Hospital)" value={aggregate.summary.presentingComplaint} />
                <InfoSection label="PRESENT ILLNESS · (Provided by Seeker Hospital)" value={aggregate.summary.presentIllness} />
                <Text style={[styles.eyebrow, { color: palette.mutedForeground, marginTop: 6 }]}>CLINICAL DETAILS · (PROVIDED BY SEEKER HOSPITAL)</Text>
                <InfoSection label="EXAMINATION" value={aggregate.summary.examination} />
                <InfoSection label="INVESTIGATIONS" value={aggregate.summary.investigations} />
                <Text style={[styles.sheetHint, { color: palette.mutedForeground }]}>The hospital-provided details above are included automatically. Add your own clinical assessment and recommendations below.</Text>
                <TextInput
                  value={advisory}
                  onChangeText={setAdvisory}
                  multiline
                  placeholder="Write your clinical opinion and recommendations…"
                  placeholderTextColor={palette.mutedForeground}
                  style={[styles.longInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]}
                />
                <SubmitButton label="Add to Advisory" disabled={!advisory.trim()} pending={mutation.isPending} onPress={() => mutation.mutate()} />
              </>
            )}
            {type === "add-vitals" && (
              <>
                <View style={styles.formGrid}>
                  {[
                    ["bp", "BP", "128/82"], ["hr", "Heart rate", "96"], ["rr", "Resp. rate", "18"],
                    ["gcs", "GCS", "14"], ["intake", "Intake (mL)", "800"], ["output", "Output (mL)", "480"], ["urine", "UO (mL/hr)", "40"],
                  ].map(([key, label, placeholder]) => (
                    <View key={key} style={styles.field}>
                      <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>{label}</Text>
                      <TextInput
                        value={vitalForm[key as keyof typeof vitalForm]}
                        onChangeText={(value) => setVitalForm((current) => ({ ...current, [key]: value }))}
                        placeholder={placeholder}
                        placeholderTextColor={palette.mutedForeground}
                        keyboardType={key === "bp" ? "numbers-and-punctuation" : "numeric"}
                        style={[styles.fieldInput, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.background }]}
                      />
                    </View>
                  ))}
                </View>
                <SubmitButton label="Add to Chart" disabled={!Object.values(vitalForm).some(Boolean)} pending={mutation.isPending} onPress={() => mutation.mutate()} />
              </>
            )}
            {type === "source" && (
              <>
                <Text style={[styles.sheetHint, { color: palette.mutedForeground }]}>Choose a source. You can review the file before sending it to this Case File.</Text>
                {attachmentError && <Text style={[styles.uploadError, { color: palette.primary }]} accessibilityRole="alert">{attachmentError}</Text>}
                {([
                  ["camera", "Camera", "camera"],
                  ["image", "Photo Gallery", "photo_gallery"],
                  ["file-text", "Document", "document"],
                  ["film", "Choose video", "video_gallery"],
                  ["video", "Record video", "video_camera"],
                ] as const).map(([icon, label, source]) => (
                  <Pressable key={label} style={[styles.sourceRow, { borderColor: palette.border }]} onPress={() => onChooseAttachment(source)}>
                    <Feather name={icon as keyof typeof Feather.glyphMap} size={20} color={palette.foreground} />
                    <Text style={[styles.sourceLabel, { color: palette.foreground }]}>{label}</Text>
                    <Feather name="chevron-right" size={18} color={palette.mutedForeground} />
                  </Pressable>
                ))}
                <Text style={[styles.sheetHint, { color: palette.mutedForeground }]}>Files up to 25 MB · videos up to 75 MB and 2 minutes</Text>
              </>
            )}
            {type === "attach" && attachment && (
              <>
                <View style={[styles.selectedFile, { backgroundColor: palette.accent }]}>
                  <Feather name="file-text" size={22} color={palette.foreground} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.selectedFileName, { color: palette.foreground }]} numberOfLines={2}>{attachment.name}</Text>
                    <Text style={[styles.sheetHint, { color: palette.mutedForeground }]}>
                      {attachment.size ? `${(attachment.size / 1024 / 1024).toFixed(1)} MB · ` : ""}{attachment.source === "photo_gallery" ? "Photo Gallery" : attachment.source === "camera" ? "Camera" : "Document"}
                    </Text>
                  </View>
                </View>
                {isVideoDraft(attachment) && (
                  <View style={{ gap: 8 }}>
                    <CaseFileVideo uri={attachment.uri} />
                    <Text style={[styles.sheetHint, { color: palette.mutedForeground }]}>Review video · {Math.floor((attachment.durationSeconds || 0) / 60)}:{String(Math.floor((attachment.durationSeconds || 0) % 60)).padStart(2, "0")} · Tap play before sending</Text>
                  </View>
                )}
                {seeker && (
                  <>
                    <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>FILE CATEGORY</Text>
                    <View style={styles.categoryRow}>
                      {CATEGORY_LABELS.map(({ label, value }) => (
                        <Pressable
                          key={value}
                          onPress={() => onCategoryChange(value)}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: attachmentCategory === value }}
                          style={[styles.categoryChip, { backgroundColor: attachmentCategory === value ? palette.foreground : palette.accent }]}
                        >
                          <Text style={[styles.categoryText, { color: attachmentCategory === value ? palette.card : palette.foreground }]}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
                {attachmentError && <Text style={[styles.uploadError, { color: palette.primary }]} accessibilityRole="alert">{attachmentError}</Text>}
                <SubmitButton label={uploading ? "Uploading…" : "Send to Case File"} disabled={seeker && !attachmentCategory} pending={uploading} onPress={onSendAttachment} />
                <Pressable onPress={onClose} disabled={uploading} style={styles.cancelAttachment}>
                  <Text style={[styles.sheetHint, { color: palette.mutedForeground }]}>Cancel</Text>
                </Pressable>
              </>
            )}
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

function InfoSection({ label, value, warning }: { label: string; value?: string | null; warning?: boolean }) {
  const palette = useColors();
  return (
    <View style={styles.infoSection}>
      <Text style={[styles.eyebrow, { color: palette.mutedForeground }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: warning && value ? palette.primary : palette.foreground }]}>{value || "Not recorded"}</Text>
    </View>
  );
}

function SubmitButton({ label, disabled, pending, onPress }: { label: string; disabled: boolean; pending: boolean; onPress: () => void }) {
  const palette = useColors();
  return (
    <Pressable disabled={disabled || pending} onPress={onPress} style={[styles.submit, { backgroundColor: disabled ? palette.muted : palette.primary }]}>
      {pending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[styles.submitText, { color: disabled ? palette.mutedForeground : "#FFFFFF" }]}>{label}</Text>}
    </Pressable>
  );
}

function StateView({ loading, label, retry }: { loading?: boolean; label: string; retry?: () => void }) {
  const palette = useColors();
  if (!loading) {
    return (
      <View style={[styles.state, { backgroundColor: palette.background }]}>
        <StateCard
          variant="error"
          icon="folder"
          title={label}
          message="Check your connection and try again."
          actionLabel={retry ? "Retry" : undefined}
          onAction={retry}
          style={styles.stateCard}
        />
      </View>
    );
  }

  return (
    <View style={[styles.state, { backgroundColor: palette.background }]}>
      <View style={styles.stateSkeletonTop}>
        <SkeletonBlock width={40} height={40} radius={14} />
        <View style={styles.stateSkeletonTitle}>
          <SkeletonBlock width="62%" height={14} />
          <SkeletonBlock width="42%" height={11} />
        </View>
      </View>
      <View style={styles.stateSkeletonVitals}>
        <SkeletonBlock width="100%" height={70} radius={16} />
      </View>
      <View style={styles.stateSkeletonMessages}>
        <SkeletonBlock width="73%" height={58} radius={18} />
        <SkeletonBlock width="61%" height={58} radius={18} style={styles.stateSkeletonOwn} />
        <SkeletonBlock width="78%" height={58} radius={18} />
      </View>
      <Text style={[styles.stateLabel, { color: palette.foreground }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 84, paddingHorizontal: 12, paddingBottom: 14, gap: 8, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.15)" },
  identity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0, paddingVertical: 4 },
  patientBadge: { width: 44, height: 44, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.17)" },
  patientBadgeText: { fontSize: 13, color: "#FFFFFF", fontFamily: "Sora_600SemiBold" },
  patientName: { fontSize: 15, color: "#FFFFFF", fontFamily: "Sora_600SemiBold" },
  patientMeta: { fontSize: 10, color: "rgba(255,255,255,.8)", marginTop: 2, fontFamily: "Inter_400Regular" },
  headerStatus: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 },
  headerStatusText: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  headerAction: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,.15)" },
  statusBar: { height: 34, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  readOnly: { marginLeft: "auto", fontSize: 11, fontFamily: "Inter_500Medium" },
  followUp: { fontSize: 12, fontFamily: "Inter_700Bold", marginLeft: 5 },
  callError: { paddingHorizontal: 16, paddingVertical: 7, fontSize: 11, fontFamily: "Inter_500Medium" },
  clinicalContext: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 9 },
  contextEmpty: { marginHorizontal: 14, marginTop: 6, fontSize: 11, fontFamily: "Inter_400Regular" },
  chips: { paddingHorizontal: 14, paddingTop: 9, paddingBottom: 7, gap: 6 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 5, flexDirection: "row", alignItems: "center", gap: 5 },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  complaint: { marginHorizontal: 14, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 8 },
  eyebrow: { fontSize: 8, letterSpacing: 1, fontFamily: "Inter_700Bold" },
  complaintText: { fontSize: 11, lineHeight: 16, marginTop: 3, fontFamily: "Inter_500Medium" },
  vitalsDock: { minHeight: 126, borderBottomWidth: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12 },
  vitalsHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", minHeight: 38 },
  vitalsTitle: { flexDirection: "row", alignItems: "center", gap: 7 },
  vitalHeaderActions: { flexDirection: "row", alignItems: "center", gap: 5 },
  chartButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  freshness: { width: 7, height: 7, borderRadius: 4 },
  chartLink: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  vitalStrip: { flexDirection: "row", alignItems: "stretch", gap: 8, paddingRight: 12, paddingBottom: 2 },
  vitalGrid: { flexDirection: "row", marginTop: 7 },
  vitalCell: { width: 76, minHeight: 74, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 14, borderWidth: 1, justifyContent: "center", ...cardShadow },
  vitalLabel: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.4 },
  vitalValue: { fontSize: 14, marginTop: 4, fontFamily: "Sora_600SemiBold" },
  vitalDetail: { fontSize: 8, lineHeight: 11, marginTop: 2, fontFamily: "Inter_400Regular" },
  addVital: { width: 44, height: 44, borderRadius: 22, overflow: "hidden", marginLeft: 2 },
  addVitalGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  chat: { flex: 1 },
  chatContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 11 },
  dateDivider: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 },
  dateLine: { height: StyleSheet.hairlineWidth, width: 42 },
  dateText: { fontSize: 9, letterSpacing: 0.5, fontFamily: "Inter_500Medium" },
  messageRow: { marginVertical: 4 },
  messageContent: { width: "86%", alignSelf: "flex-start" },
  messageContentOwn: { alignSelf: "flex-end" },
  senderLine: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4, marginLeft: 4 },
  senderLineOwn: { marginRight: 4, marginLeft: 0 },
  senderAvatar: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  senderInitials: { fontSize: 8, fontFamily: "Inter_700Bold" },
  senderLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  bubble: { maxWidth: "100%", borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, ...cardShadow },
  ownBubble: { borderColor: "transparent", borderTopRightRadius: 5, borderTopLeftRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  otherBubble: { borderTopLeftRadius: 5, borderTopRightRadius: 18, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 },
  advisoryHeading: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 7 },
  advisoryTitle: { fontSize: 11, fontFamily: "Inter_700Bold" },
  signedBadge: { marginLeft: "auto", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  signedBadgeText: { fontSize: 8, fontFamily: "Inter_700Bold" },
  messageText: { fontSize: 13, lineHeight: 20, fontFamily: "Inter_400Regular" },
  advisoryFooter: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  advisoryMeta: { fontSize: 9, fontFamily: "Inter_500Medium" },
  fullAdvisory: { marginLeft: "auto", fontSize: 9, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
  messageTime: { fontSize: 10, marginTop: 6, alignSelf: "flex-end", fontFamily: "Inter_400Regular" },
  emptyChat: { alignItems: "center", paddingVertical: 54, gap: 8 },
  emptyChatTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyChatText: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 270 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 7, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, ...cardShadow },
  composeIcon: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  messageInput: { flex: 1, minHeight: 44, maxHeight: 100, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10, fontSize: 13, fontFamily: "Inter_400Regular" },
  send: { width: 44, height: 44, borderRadius: 22, overflow: "hidden" },
  sendGradient: { flex: 1, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.36)", justifyContent: "flex-end" },
  sheet: { maxHeight: "82%", borderTopLeftRadius: designTokens.radius.sheet, borderTopRightRadius: designTokens.radius.sheet, overflow: "hidden" },
  sheetHeader: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  sheetTitle: { fontSize: 18, fontFamily: "Sora_600SemiBold" },
  sheetSubtitle: { fontSize: 11, marginTop: 2, fontFamily: "Inter_400Regular" },
  sheetContent: { padding: 18, gap: 18 },
  infoSection: { gap: 6 },
  infoValue: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_500Medium" },
  primaryOutline: { height: 48, borderRadius: 13, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14 },
  primaryOutlineText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  flowsheet: { borderWidth: 1, borderRadius: 12, overflow: "hidden", minWidth: 620 },
  flowRow: { flexDirection: "row", minHeight: 44, alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth },
  flowHeader: { borderTopWidth: 0 },
  flowHead: { width: 100, paddingHorizontal: 8, fontSize: 9, fontFamily: "Inter_700Bold" },
  flowCell: { width: 100, paddingHorizontal: 8, fontSize: 11, fontFamily: "Inter_500Medium" },
  noData: { padding: 30, textAlign: "center", fontSize: 13 },
  disclaimer: { fontSize: 11, lineHeight: 17, padding: 12, borderWidth: 1, borderRadius: 10, fontFamily: "Inter_400Regular" },
  trailEntry: { borderLeftWidth: 2, paddingLeft: 12, gap: 6 },
  trailTime: { fontSize: 10, fontFamily: "Inter_500Medium" },
  trailText: { fontSize: 14, lineHeight: 21, fontFamily: "Inter_400Regular" },
  sheetHint: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
  longInput: { minHeight: 150, borderWidth: 1, borderRadius: 13, padding: 13, textAlignVertical: "top", fontSize: 14, lineHeight: 20, fontFamily: "Inter_400Regular" },
  submit: { height: 50, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  submitText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  formGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  field: { width: "47%", gap: 5 },
  fieldLabel: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  fieldInput: { height: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 11, fontSize: 14, fontFamily: "Inter_500Medium" },
  sourceRow: { borderWidth: 1, borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  sourceLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  selectedFile: { borderRadius: 12, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  selectedFileName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  uploadError: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_500Medium" },
  cancelAttachment: { alignItems: "center", padding: 8 },
  categoryRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  categoryChip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  categoryText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  state: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
  stateLabel: { fontSize: 14, fontFamily: "Inter_500Medium", textAlign: "center" },
  retry: { fontSize: 13, fontFamily: "Inter_700Bold", padding: 8 },
  stateCard: { width: "100%", maxWidth: 360 },
  stateSkeletonTop: { width: "100%", maxWidth: 360, flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 18, backgroundColor: "#FFFFFF" },
  stateSkeletonTitle: { flex: 1, gap: 8 },
  stateSkeletonVitals: { width: "100%", maxWidth: 360, marginTop: 4 },
  stateSkeletonMessages: { width: "100%", maxWidth: 360, gap: 10, marginTop: 10 },
  stateSkeletonOwn: { alignSelf: "flex-end" },
});