import { Feather } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { VideoView, useVideoPlayer } from "expo-video";
import { File as ExpoFile, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  ActivityIndicator,
  Alert,
  Image,
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

import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
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
    focus === "advisory" ? (seeker ? "trail" : "advisory") : null,
  );
  const [attachment, setAttachment] = useState<AttachmentDraft | null>(null);
  const [attachmentCategory, setAttachmentCategory] = useState<AttachmentCategory | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<string | null>(null);
  const [startingCall, setStartingCall] = useState<"voice" | "video" | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

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
      if (Platform.OS !== "web") Alert.alert("Cannot start call", reason);
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
        Alert.alert("Permission needed", message, [
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
      Alert.alert(disposition === "inline" ? "Could not open file" : "Could not download file", reason);
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
      <View style={[styles.header, { paddingTop: Platform.OS === "web" ? 68 : insets.top + 8, borderBottomColor: palette.conversationBorder, backgroundColor: palette.conversationCard }]}>
        <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
          <Feather name="arrow-left" size={21} color={palette.foreground} />
        </Pressable>
        <Pressable style={styles.identity} onPress={() => setSheet("summary")}>
          <View style={[styles.patientBadge, { backgroundColor: palette.conversationSoft }]}>
            <Text style={[styles.patientBadgeText, { color: palette.conversationPrimary }]}>{booking.patientAge}{gender}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.patientName, { color: palette.foreground }]}>{booking.patientName}</Text>
            <Text style={[styles.patientMeta, { color: palette.mutedForeground }]} numberOfLines={1}>
              {booking.serviceName}{booking.bookingNumber ? ` · ${booking.bookingNumber}` : ""}
            </Text>
          </View>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable disabled={!capabilities.callsEnabled || !!startingCall} onPress={() => startCall("voice")} accessibilityLabel="Call care team" style={{ opacity: capabilities.callsEnabled && !startingCall ? 1 : 0.3 }}>
            <Feather name="phone" size={19} color={palette.foreground} />
          </Pressable>
          <Pressable disabled={!capabilities.videoEnabled || !!startingCall} onPress={() => startCall("video")} accessibilityLabel="Video call care team" style={{ opacity: capabilities.videoEnabled && !startingCall ? 1 : 0.3 }}>
            <Feather name="video" size={20} color={palette.foreground} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.statusBar, { backgroundColor: palette.conversationSoft, borderBottomColor: palette.conversationBorder }]}>
        <View style={[styles.statusDot, { backgroundColor: status.dot }]} />
        <Text style={[styles.statusLabel, { color: status.text }]}>
          {booking.consultationLifecycleAvailable === false ? "Schedule unavailable" : `${status.label} consultation`}
        </Text>
        <Text style={[styles.readOnly, { color: palette.mutedForeground }]}>
          {booking.consultationLifecycleAvailable === false
            ? "Time needs review"
            : capabilities.readOnly
              ? "Read only"
              : "Case File"}
        </Text>
      </View>
      {callError && <Text style={[styles.callError, { color: palette.primary, backgroundColor: palette.conversationCard }]} accessibilityRole="alert">{callError}</Text>}

      <View style={[styles.clinicalContext, { backgroundColor: palette.conversationCard, borderBottomColor: palette.conversationBorder }]}>
        <Text style={[styles.eyebrow, { color: palette.mutedForeground, marginHorizontal: 14, marginTop: 8 }]}>
          COMORBIDITIES / PAST ILLNESS
        </Text>
        {comorbidityEntries.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {comorbidityEntries.map((item, index) => (
              <Pressable
                key={`${index}-${item}`}
                onPress={() => setSheet("summary")}
                testID={`case-file-comorbidity-${index}`}
                accessibilityRole="button"
                accessibilityLabel={item}
                style={[styles.chip, { backgroundColor: palette.conversationSoft, borderColor: palette.conversationBorder }]}
              >
                <Text style={[styles.chipText, { color: palette.foreground }]}>{item}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={[styles.contextEmpty, { color: palette.mutedForeground }]} testID="empty-comorbidities">
            Not provided
          </Text>
        )}
        {!!caseFile.summary.allergies && (
          <Pressable onPress={() => setSheet("summary")} style={[styles.chip, { alignSelf: "flex-start", marginHorizontal: 14, backgroundColor: `${palette.primary}0D`, borderColor: `${palette.primary}28` }]}>
            <Feather name="alert-triangle" size={12} color={palette.primary} />
            <Text style={[styles.chipText, { color: palette.primary }]}>{caseFile.summary.allergies}</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setSheet("summary")} style={[styles.complaint, { backgroundColor: palette.conversationSoft }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: palette.mutedForeground }]}>PRESENTING COMPLAINT</Text>
            <Text style={[styles.complaintText, { color: palette.foreground }]} numberOfLines={2}>
              {caseFile.summary.presentingComplaint || "Not recorded"}
            </Text>
          </View>
          <Feather name="chevron-right" size={17} color={palette.mutedForeground} />
        </Pressable>
      </View>

      <View style={[styles.vitalsDock, { backgroundColor: palette.conversationCard, borderBottomColor: palette.conversationBorder }]}>
        <Pressable style={{ flex: 1 }} onPress={() => setSheet("vitals")}>
          <View style={styles.vitalsTitle}>
            <View style={[styles.freshness, { backgroundColor: freshnessColor }]} />
            <Text style={[styles.eyebrow, { color: palette.conversationMuted }]}>LATEST VITALS</Text>
            <Text style={[styles.chartLink, { color: palette.foreground }]}>Full chart</Text>
          </View>
          <View style={styles.vitalGrid}>
            <VitalCell label="BP" value={latest?.systolicBp ? `${latest.systolicBp}/${latest.diastolicBp || "—"}` : "—"} detail={`RR ${latest?.respiratoryRate ?? "—"} /min`} />
            <VitalCell label="HR" value={latest?.heartRate != null ? `${latest.heartRate}` : "—"} detail="bpm" />
            <VitalCell label="I/O" value={latest?.intake != null || latest?.output != null ? `${(latest?.intake || 0) - (latest?.output || 0)} mL` : "—"} detail={`UO ${latest?.hourlyUrineOutput ?? "—"} mL/hr`} />
            <VitalCell label="GCS" value={latest?.gcs != null ? `${latest.gcs}/15` : "—"} detail={latest?.observedAt ? new Date(latest.observedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }) : "Not recorded"} />
          </View>
        </Pressable>
        {capabilities.canAddVitals && (
          <Pressable onPress={() => setSheet("add-vitals")} style={[styles.addVital, { backgroundColor: palette.primary }]} accessibilityLabel="Add vitals">
            <Feather name="plus" size={19} color="#FFFFFF" />
          </Pressable>
        )}
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
            onAttachmentAction={(attachmentId, disposition, filename) => void openCaseFileAttachment(attachmentId, disposition, filename)}
            openingAttachmentId={openingAttachmentId}
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
            <Pressable onPress={() => setSheet("source")} style={styles.composeIcon} accessibilityLabel="Attach clinical file">
              <Feather name="paperclip" size={21} color={palette.foreground} />
            </Pressable>
          )}
          {capabilities.canComposeAdvisory && (
            <Pressable onPress={() => setSheet("advisory")} style={styles.composeIcon} accessibilityLabel="Add Clinical Advisory">
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
            style={[styles.send, { backgroundColor: message.trim() ? palette.conversationPrimary : palette.conversationBorder }]}
          >
            {sendMessage.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Feather name="arrow-up" size={19} color={message.trim() ? "#FFFFFF" : palette.mutedForeground} />}
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
    </KeyboardAvoidingView>
  );
}

function VitalCell({ label, value, detail }: { label: string; value: string; detail: string }) {
  const palette = useColors();
  return (
    <View style={styles.vitalCell}>
      <Text style={[styles.vitalLabel, { color: palette.mutedForeground }]}>{label}</Text>
      <Text style={[styles.vitalValue, { color: palette.foreground }]}>{value}</Text>
      <Text style={[styles.vitalDetail, { color: palette.mutedForeground }]}>{detail}</Text>
    </View>
  );
}

function MessageBubble({
  message,
  bookingId,
  own,
  onAdvisory,
  onAttachmentAction,
  openingAttachmentId,
}: {
  message: CaseFileMessage;
  bookingId: string;
  own: boolean;
  onAdvisory: () => void;
  onAttachmentAction: (attachmentId: string, disposition: "inline" | "attachment", filename?: string | null) => void;
  openingAttachmentId: string | null;
}) {
  const palette = useColors();
  const advisory = message.kind === "advisory";
  const senderLabel = own
    ? "You"
    : message.senderRole === "provider"
      ? "Consultant"
      : "Treating team";
  const time = new Date(message.createdAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const bubbleStyle = [
    styles.bubble,
    own && !advisory ? styles.ownBubble : styles.otherBubble,
    advisory && { backgroundColor: palette.advisoryBackground, borderColor: palette.advisoryBorder },
    !advisory && { backgroundColor: own ? palette.conversationPrimary : palette.conversationCard, borderColor: own ? palette.conversationPrimary : palette.conversationBorder },
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
        <AttachmentPreview attachment={message.attachment} bookingId={bookingId} onOpen={() => onAttachmentAction(message.attachment!.id, "inline")} />
      )}
      {message.attachment && (
        <View style={styles.attachmentHeading}>
          <View style={[styles.attachmentIcon, { backgroundColor: own ? "rgba(255,255,255,.14)" : palette.conversationSoft }]}>
             <Feather name={message.attachment.mimeType?.startsWith("video/") ? "video" : message.attachment.mimeType?.startsWith("image/") ? "image" : "file-text"} size={16} color={own ? palette.conversationPrimaryForeground : palette.conversationPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.attachmentName, { color: own ? palette.conversationPrimaryForeground : palette.foreground }]}>{message.attachment.originalFilename || "Clinical file"}</Text>
            <Text style={[styles.attachmentMeta, { color: own ? "rgba(255,255,255,.68)" : palette.conversationMuted }]}>
               {message.attachment.mimeType?.split("/").pop()?.toUpperCase() || "File"}
              {message.attachment.byteSize ? ` · ${Math.max(1, Math.round(message.attachment.byteSize / 1024))} KB` : ""}
               {message.attachment.durationSeconds ? ` · ${Math.floor(message.attachment.durationSeconds / 60)}:${String(Math.floor(message.attachment.durationSeconds % 60)).padStart(2, "0")}` : ""}
            </Text>
          </View>
        </View>
      )}
      {!!message.body && <Text style={[styles.messageText, { color: own && !advisory ? palette.conversationPrimaryForeground : palette.foreground }]}>{message.body}</Text>}
      {advisory && (
        <View style={styles.advisoryFooter}>
          <Feather name="lock" size={11} color={palette.advisoryForeground} />
          <Text style={[styles.advisoryMeta, { color: palette.advisoryForeground }]}>Permanent signed record · {time}</Text>
          <Text style={[styles.fullAdvisory, { color: palette.advisoryForeground }]}>View full</Text>
        </View>
      )}
      {!advisory && <Text style={[styles.messageTime, { color: own ? "rgba(255,255,255,.65)" : palette.conversationMuted }]}>{time}</Text>}
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
        {advisory
          ? <Pressable onPress={onAdvisory} style={bubbleStyle} accessibilityRole="button" accessibilityLabel="View Clinical Advisory">{bubbleContent}</Pressable>
          : <View style={bubbleStyle}>{bubbleContent}</View>}
        {message.attachment && (
          <View style={[styles.attachmentActions, own && styles.attachmentActionsOwn]}>
            <Pressable
              disabled={openingAttachmentId === message.attachment.id}
              onPress={() => onAttachmentAction(message.attachment!.id, "inline")}
              style={[styles.attachmentActionButton, { backgroundColor: palette.conversationSoft }]}
              accessibilityRole="button"
              accessibilityLabel={`Preview ${message.attachment.originalFilename || "clinical file"}`}
            >
              <Text style={[styles.attachmentAction, { color: palette.conversationPrimary }]}>
                {openingAttachmentId === message.attachment.id ? "Opening…" : "Preview / open"}
              </Text>
            </Pressable>
            <Pressable
              disabled={openingAttachmentId === message.attachment.id}
               onPress={() => onAttachmentAction(message.attachment!.id, "attachment", message.attachment!.originalFilename)}
              style={[styles.attachmentActionButton, { backgroundColor: palette.conversationSoft }]}
              accessibilityRole="button"
              accessibilityLabel={`Download original ${message.attachment.originalFilename || "clinical file"}`}
            >
              <Text style={[styles.attachmentAction, { color: palette.conversationPrimary }]}>Download original</Text>
            </Pressable>
          </View>
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

function AttachmentPreview({ attachment, bookingId, onOpen }: {
  attachment: NonNullable<CaseFileMessage["attachment"]>;
  bookingId: string;
  onOpen: () => void;
}) {
  const palette = useColors();
  const [url, setUrl] = useState<string | null>(null);
  const [full, setFull] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isImage = attachment.mimeType?.startsWith("image/");
  const isVideo = attachment.mimeType?.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(attachment.originalFilename || "");
  const refresh = async () => {
    try {
      const result = await requestJson<{ url: string }>(`/api/bookings/${encodeURIComponent(bookingId)}/case-file/attachments/${encodeURIComponent(attachment.id)}/signed-url?disposition=inline`);
      setUrl(result.url);
      setError(null);
      return result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Preview unavailable.");
      return null;
    }
  };
  useEffect(() => {
    if (isImage || isVideo) void refresh();
  }, [bookingId, attachment.id]);
  const open = async () => {
    if (!isImage && !isVideo) { onOpen(); return; }
    if (await refresh()) setFull(true);
  };
  return (
    <>
      <Pressable onPress={() => void open()} accessibilityRole="button" accessibilityLabel={`Open ${attachment.originalFilename || "attachment"}`} style={{ marginBottom: 8, borderRadius: 9, overflow: "hidden", backgroundColor: palette.conversationSoft }}>
        {isImage && url ? <Image source={{ uri: url }} style={{ width: 220, height: 155 }} resizeMode="cover" onError={() => setError("Preview expired. Tap to retry.")} /> :
          isVideo ? <View style={{ width: 220, height: 135, alignItems: "center", justifyContent: "center", backgroundColor: "#17212f" }}>
            <Feather name="play-circle" size={42} color="#FFFFFF" />
            <Text style={{ color: "#FFFFFF", fontSize: 11 }}>Play video</Text>
          </View> :
          <View style={{ width: 220, padding: 18, flexDirection: "row", alignItems: "center", gap: 9 }}>
            <Feather name="file-text" size={25} color={palette.conversationPrimary} />
            <Text style={{ color: palette.foreground, fontSize: 12 }}>{attachment.mimeType === "application/pdf" ? "Open complete PDF" : "Open complete file"}</Text>
          </View>}
      </Pressable>
      {error && <Text style={{ color: palette.primary, fontSize: 11 }} accessibilityRole="alert">{error}</Text>}
      <Modal visible={full} animationType="fade" onRequestClose={() => setFull(false)}>
        <View style={{ flex: 1, backgroundColor: "#101820", justifyContent: "center", padding: 12 }}>
          <Pressable onPress={() => setFull(false)} accessibilityLabel="Close preview" style={{ position: "absolute", top: 45, right: 20, zIndex: 2, padding: 12 }}><Feather name="x" size={25} color="#FFFFFF" /></Pressable>
          {full && url && (isImage ? <Image source={{ uri: url }} style={{ width: "100%", height: "80%" }} resizeMode="contain" onError={() => setError("Image could not be loaded. Close and retry.")} /> :
            isVideo ? <CaseFileVideo uri={url} height={300} /> : null)}
          {error && <Text style={{ color: "#FFFFFF", textAlign: "center" }}>{error}</Text>}
        </View>
      </Modal>
    </>
  );
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
      Alert.alert("PDF unavailable", "This Clinical Advisory does not have a PDF attachment.");
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
      Alert.alert("Could not open PDF", reason);
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
        else Alert.alert("Clinical Advisory saved", "The record was saved, but its PDF is not available.");
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
  return (
    <View style={[styles.state, { backgroundColor: palette.background }]}>
      {loading ? <ActivityIndicator color={palette.primary} /> : <Feather name="folder" size={34} color={palette.mutedForeground} />}
      <Text style={[styles.stateLabel, { color: palette.foreground }]}>{label}</Text>
      {retry && <Pressable onPress={retry}><Text style={[styles.retry, { color: palette.primary }]}>Retry</Text></Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", minHeight: 64, paddingHorizontal: 10, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  identity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  patientBadge: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  patientBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  patientName: { fontSize: 15, fontFamily: "Inter_700Bold" },
  patientMeta: { fontSize: 11, marginTop: 2, fontFamily: "Inter_400Regular" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 17, paddingHorizontal: 8 },
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
  vitalsDock: { minHeight: 82, flexDirection: "row", borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 8 },
  vitalsTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  freshness: { width: 7, height: 7, borderRadius: 4 },
  chartLink: { marginLeft: "auto", fontSize: 10, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
  vitalGrid: { flexDirection: "row", marginTop: 7 },
  vitalCell: { flex: 1, paddingRight: 6 },
  vitalLabel: { fontSize: 8, fontFamily: "Inter_500Medium" },
  vitalValue: { fontSize: 14, marginTop: 2, fontFamily: "Inter_700Bold" },
  vitalDetail: { fontSize: 8, marginTop: 1, fontFamily: "Inter_400Regular" },
  addVital: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", marginLeft: 4, alignSelf: "center" },
  chat: { flex: 1 },
  chatContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  dateDivider: { transform: [{ scaleY: -1 }], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 6 },
  dateLine: { height: StyleSheet.hairlineWidth, width: 42 },
  dateText: { fontSize: 9, letterSpacing: 0.5, fontFamily: "Inter_500Medium" },
  messageRow: { marginVertical: 3 },
  messageContent: { width: "88%", alignSelf: "flex-start" },
  messageContentOwn: { alignSelf: "flex-end" },
  senderLine: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4, marginLeft: 4 },
  senderLineOwn: { marginRight: 4, marginLeft: 0 },
  senderAvatar: { width: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  senderInitials: { fontSize: 7, fontFamily: "Inter_700Bold" },
  senderLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  bubble: { maxWidth: "100%", borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  ownBubble: { borderTopRightRadius: 4, borderTopLeftRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  otherBubble: { borderTopLeftRadius: 4, borderTopRightRadius: 16, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  advisoryHeading: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 7 },
  advisoryTitle: { fontSize: 11, fontFamily: "Inter_700Bold" },
  signedBadge: { marginLeft: "auto", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  signedBadgeText: { fontSize: 8, fontFamily: "Inter_700Bold" },
  attachmentHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  attachmentIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  attachmentName: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  attachmentMeta: { fontSize: 9, marginTop: 2, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
  attachmentAction: { fontSize: 10, marginTop: 6, fontFamily: "Inter_600SemiBold" },
  attachmentActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 6, marginTop: 6 },
  attachmentActionsOwn: { justifyContent: "flex-end" },
  attachmentActionButton: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  messageText: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular" },
  advisoryFooter: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  advisoryMeta: { fontSize: 9, fontFamily: "Inter_500Medium" },
  fullAdvisory: { marginLeft: "auto", fontSize: 9, fontFamily: "Inter_600SemiBold", textDecorationLine: "underline" },
  messageTime: { fontSize: 9, marginTop: 5, alignSelf: "flex-end", fontFamily: "Inter_400Regular" },
  emptyChat: { transform: [{ scaleY: -1 }], alignItems: "center", paddingVertical: 54, gap: 8 },
  emptyChatTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptyChatText: { fontSize: 12, lineHeight: 18, fontFamily: "Inter_400Regular", textAlign: "center", maxWidth: 270 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 7, paddingHorizontal: 10, paddingTop: 9, borderTopWidth: StyleSheet.hairlineWidth },
  composeIcon: { width: 34, height: 42, alignItems: "center", justifyContent: "center" },
  messageInput: { flex: 1, minHeight: 42, maxHeight: 100, borderRadius: 21, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13, fontFamily: "Inter_400Regular" },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,.36)", justifyContent: "flex-end" },
  sheet: { maxHeight: "82%", borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: "hidden" },
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
});