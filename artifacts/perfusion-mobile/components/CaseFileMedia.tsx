import { Feather } from "@expo/vector-icons";
import { VideoView, useVideoPlayer } from "expo-video";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CaseFilePdfPreview from "./CaseFilePdfPreview";
import { designTokens } from "@/constants/designTokens";
import { apiFetch } from "@/hooks/useApi";
import { useColors } from "@/hooks/useColors";
import type { CaseFileMessage } from "@/lib/mobile-models";

type CaseFileAttachment = NonNullable<CaseFileMessage["attachment"]>;
type MediaKind = "image" | "video" | "pdf" | "document";

function boundedAspectRatio(width: number, height: number): number {
  return width > 0 && height > 0 ? Math.max(0.72, Math.min(width / height, 1.7)) : 4 / 5;
}

function getMediaKind(attachment: CaseFileAttachment): MediaKind {
  const mimeType = attachment.mimeType?.toLowerCase() || "";
  const extension = attachment.originalFilename?.split(".").pop()?.toLowerCase() || "";
  if (mimeType.startsWith("image/") || ["jpg", "jpeg", "png", "gif"].includes(extension)) return "image";
  if (mimeType.startsWith("video/") || ["mp4", "mov", "webm"].includes(extension)) return "video";
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  return "document";
}

function getFileTypeLabel(attachment: CaseFileAttachment, kind: MediaKind): string {
  if (kind === "image") return "Image";
  if (kind === "video") return "Video";
  if (kind === "pdf") return "PDF";
  return attachment.originalFilename?.split(".").pop()?.toUpperCase() || "Document";
}

function formatByteSize(size?: number | null): string | null {
  if (!size || size <= 0) return null;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function getAttachmentDetails(attachment: CaseFileAttachment, kind: MediaKind): string {
  const category = attachment.category?.replace(/_/g, " ");
  const duration = attachment.durationSeconds
    ? `${Math.floor(attachment.durationSeconds / 60)}:${String(Math.floor(attachment.durationSeconds % 60)).padStart(2, "0")}`
    : null;
  return [
    category,
    getFileTypeLabel(attachment, kind),
    formatByteSize(attachment.byteSize),
    duration,
  ].filter(Boolean).join(" · ");
}

async function getSignedUrl(
  bookingId: string,
  attachmentId: string,
  disposition: "inline" | "attachment",
): Promise<string> {
  const response = await apiFetch(
    `/api/bookings/${encodeURIComponent(bookingId)}/case-file/attachments/${encodeURIComponent(attachmentId)}/signed-url?disposition=${disposition}`,
  );
  const body = await response.json().catch(() => ({})) as {
    url?: unknown;
    message?: unknown;
    error?: unknown;
  };
  if (!response.ok || typeof body.url !== "string") {
    const message = typeof body.message === "string"
      ? body.message
      : typeof body.error === "string"
        ? body.error
        : "The secure media link could not be created.";
    throw new Error(message);
  }
  return body.url;
}

export function CaseFileAttachmentPreview({
  attachment,
  bookingId,
  onOpen,
}: {
  attachment: CaseFileAttachment;
  bookingId: string;
  onOpen: (attachment: CaseFileAttachment) => void;
}) {
  const palette = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const kind = getMediaKind(attachment);
  const [url, setUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [mediaAspect, setMediaAspect] = useState(kind === "video" ? 4 / 5 : 4 / 3);
  const previewWidth = Math.max(150, Math.min((screenWidth - 32) * 0.86 - 32, 340));
  const details = getAttachmentDetails(attachment, kind);

  useEffect(() => {
    if (kind !== "image" && kind !== "video") return;
    let current = true;
    setUrl(null);
    setPreviewError(false);
    void getSignedUrl(bookingId, attachment.id, "inline")
      .then((signedUrl) => {
        if (current) setUrl(signedUrl);
      })
      .catch(() => {
        if (current) setPreviewError(true);
      });
    return () => {
      current = false;
    };
  }, [attachment.id, bookingId, kind]);

  return (
    <View style={styles.preview}>
      <Pressable
        onPress={() => onOpen(attachment)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${getFileTypeLabel(attachment, kind)}${attachment.category && attachment.category !== "uncategorized" ? `, ${attachment.category.replace(/_/g, " ")}` : ""}`}
        testID={`open-case-file-attachment-${attachment.id}`}
        style={({ pressed }) => [
          styles.previewPressable,
          { opacity: pressed ? 0.9 : 1, borderColor: palette.conversationBorder },
        ]}
      >
        {kind === "image" ? (
          url && !previewError ? (
            <Image
              source={{ uri: url }}
              style={[styles.imagePreview, { width: previewWidth, aspectRatio: mediaAspect }]}
              resizeMode="contain"
              onLoad={(event) => {
                const { width, height } = event.nativeEvent.source;
                setMediaAspect(boundedAspectRatio(width, height));
              }}
              onError={() => setPreviewError(true)}
            />
          ) : (
            <View style={[styles.loadingPreview, styles.imagePreview, { width: previewWidth, aspectRatio: mediaAspect }]}>
              {previewError
                ? <Feather name="image" size={25} color={palette.conversationPrimary} />
                : <ActivityIndicator color={palette.conversationPrimary} />}
              {previewError && <Text style={[styles.previewHint, { color: palette.conversationMuted }]}>Tap to retry preview</Text>}
            </View>
          )
        ) : kind === "video" ? (
          <View style={[styles.videoPreview, { width: previewWidth, aspectRatio: mediaAspect }]}>
            {url && !previewError ? (
              <CaseFileVideoThumbnail uri={url} onAspectRatio={setMediaAspect} />
            ) : (
              <View style={styles.videoPlaceholder}>
                {previewError
                  ? <Feather name="video" size={30} color={palette.conversationPrimaryForeground} />
                  : <ActivityIndicator color={palette.conversationPrimaryForeground} />}
                {previewError && <Text style={[styles.videoHint, { color: palette.conversationPrimaryForeground }]}>Tap to retry preview</Text>}
              </View>
            )}
            <View pointerEvents="none" style={styles.playAffordance}>
              <View style={styles.playBadge}>
                <Feather name="play" size={23} color={palette.conversationPrimaryForeground} />
              </View>
            </View>
            {!!attachment.durationSeconds && (
              <View pointerEvents="none" style={styles.durationBadge}>
                <Text style={styles.durationText}>
                  {Math.floor(attachment.durationSeconds / 60)}:{String(Math.floor(attachment.durationSeconds % 60)).padStart(2, "0")}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.documentPreview, { width: previewWidth,
            backgroundColor: palette.conversationCard,
            borderColor: palette.conversationBorder,
          }]}>
            <View style={[styles.documentIcon, { backgroundColor: palette.conversationSoft }]}>
              <Feather
                name={kind === "pdf" ? "file-text" : "file"}
                size={22}
                color={palette.conversationPrimary}
              />
            </View>
            <View style={styles.documentText}>
              <Text style={[styles.documentType, { color: palette.conversationPrimary }]} numberOfLines={1}>
                {kind === "pdf" ? "PDF preview" : `${getFileTypeLabel(attachment, kind)} document`}
              </Text>
              <Text style={[styles.documentDetails, { color: palette.conversationMuted }]} numberOfLines={1}>
                {details}
              </Text>
            </View>
            <Feather name="arrow-up-right" size={17} color={palette.conversationMuted} />
          </View>
        )}
      </Pressable>

    </View>
  );
}

function CaseFileVideoThumbnail({ uri, onAspectRatio }: { uri: string; onAspectRatio: (ratio: number) => void }) {
  const palette = useColors();
  const player = useVideoPlayer({ uri });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status }) => {
      setFailed(status === "error");
      if (status === "readyToPlay" && player.videoTrack?.size) {
        onAspectRatio(boundedAspectRatio(player.videoTrack.size.width, player.videoTrack.size.height));
      }
    });
    const trackSubscription = player.addListener("videoTrackChange", ({ videoTrack }) => {
      if (videoTrack?.size) onAspectRatio(boundedAspectRatio(videoTrack.size.width, videoTrack.size.height));
    });
    return () => {
      subscription.remove();
      trackSubscription.remove();
    };
  }, [onAspectRatio, player]);

  return failed ? (
    <View style={[styles.videoPlaceholder, { backgroundColor: palette.conversationPrimary }]}>
      <Feather name="video" size={30} color={palette.conversationPrimaryForeground} />
    </View>
  ) : (
    <VideoView
      player={player}
      nativeControls={false}
      style={styles.videoFrame}
    />
  );
}

export function CaseFileMediaViewer({
  visible,
  attachment,
  bookingId,
  downloading,
  onClose,
  onDownload,
}: {
  visible: boolean;
  attachment: CaseFileAttachment | null;
  bookingId: string;
  downloading: boolean;
  onClose: () => void;
  onDownload: () => void;
}) {
  const palette = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const kind = attachment ? getMediaKind(attachment) : "document";
  const mediaLabel = attachment ? getFileTypeLabel(attachment, kind) : "Clinical attachment";
  const previewHeight = Math.max(240, height - insets.top - insets.bottom - 68);

  useEffect(() => {
    if (!visible || !attachment) return;
    let current = true;
    setUrl(null);
    setError(null);
    void getSignedUrl(bookingId, attachment.id, "inline")
      .then((signedUrl) => {
        if (current) setUrl(signedUrl);
      })
      .catch((reason) => {
        if (current) {
          setError(reason instanceof Error ? reason.message : "The secure media preview could not be loaded.");
        }
      });
    return () => {
      current = false;
    };
  }, [attachment?.id, bookingId, reload, visible]);

  return (
    <Modal
      visible={visible && !!attachment}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.viewer, { backgroundColor: designTokens.color.callScrim }]}>
        <View style={[styles.viewerHeader, { paddingTop: insets.top + 6 }]}>
          <Pressable
            onPress={onClose}
            style={styles.viewerIcon}
            accessibilityRole="button"
            accessibilityLabel="Close media viewer"
            testID="close-case-file-media-viewer"
          >
            <Feather name="arrow-left" size={21} color={palette.conversationPrimaryForeground} />
          </Pressable>
          <View style={styles.viewerTitle}>
            <Text style={[styles.viewerFileName, { color: palette.conversationPrimaryForeground }]} numberOfLines={1}>
              {mediaLabel}
            </Text>
            {!!attachment && (
              <Text style={[styles.viewerDetails, { color: palette.conversationPrimaryForeground }]}>
                {getAttachmentDetails(attachment, kind)}
              </Text>
            )}
          </View>
          <Pressable
            onPress={onDownload}
            disabled={downloading}
            style={[styles.viewerIcon, { opacity: downloading ? 0.65 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel={`Download original ${mediaLabel}`}
            testID="download-case-file-media"
          >
            {downloading
              ? <ActivityIndicator color={palette.conversationPrimaryForeground} />
              : <Feather name="download" size={19} color={palette.conversationPrimaryForeground} />}
          </Pressable>
        </View>

        <View style={[styles.viewerContent, { paddingBottom: insets.bottom }]}>
          {!url && !error ? (
            <View style={styles.viewerStatus}>
              <ActivityIndicator color={palette.conversationPrimaryForeground} />
              <Text style={[styles.viewerStatusText, { color: palette.conversationPrimaryForeground }]}>Loading secure preview…</Text>
            </View>
          ) : error ? (
            <ViewerError
              message={error}
              onRetry={() => setReload((value) => value + 1)}
              palette={palette}
            />
          ) : kind === "image" && url ? (
            <ScrollView
              style={styles.imageViewer}
              contentContainerStyle={styles.imageViewerContent}
              minimumZoomScale={1}
              maximumZoomScale={Platform.OS === "ios" ? 3 : 1}
              centerContent
            >
              <Image
                source={{ uri: url }}
                style={{ width, height: previewHeight }}
                resizeMode="contain"
                onError={() => setError("The image preview could not be loaded. Retry to refresh its secure link.")}
              />
            </ScrollView>
          ) : kind === "video" && url ? (
            <CaseFileVideo uri={url} height={previewHeight} />
          ) : kind === "pdf" && url ? (
            <CaseFilePdfPreview
              url={url}
              onError={() => setError("This PDF could not be previewed on this device. Use the download icon to save the original.")}
            />
          ) : attachment ? (
            <DocumentFallback attachment={attachment} palette={palette} />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function ViewerError({
  message,
  onRetry,
  palette,
}: {
  message: string;
  onRetry: () => void;
  palette: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.viewerStatus}>
      <Feather name="alert-circle" size={30} color={palette.primary} />
      <Text style={[styles.viewerStatusText, { color: palette.conversationPrimaryForeground }]}>{message}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button" accessibilityLabel="Retry media preview">
        <Text style={[styles.retryPreview, { color: palette.conversationPrimaryForeground }]}>Retry preview</Text>
      </Pressable>
    </View>
  );
}

function DocumentFallback({
  attachment,
  palette,
}: {
  attachment: CaseFileAttachment;
  palette: ReturnType<typeof useColors>;
}) {
  const kind = getMediaKind(attachment);
  return (
    <View style={styles.documentFallback}>
      <View style={[styles.fallbackIcon, { backgroundColor: palette.conversationSoft }]}>
        <Feather
          name={kind === "pdf" ? "file-text" : "file"}
          size={34}
          color={palette.conversationPrimary}
        />
      </View>
      <Text style={[styles.fallbackTitle, { color: palette.conversationPrimaryForeground }]}>
        {getFileTypeLabel(attachment, kind)} document
      </Text>
      <Text style={[styles.viewerStatusText, { color: palette.conversationPrimaryForeground }]}>
        This file type does not have an in-app preview. Use the download icon above to save the original.
      </Text>
    </View>
  );
}

function CaseFileVideo({
  uri,
  height,
}: {
  uri: string;
  height: number;
}) {
  const palette = useColors();
  const player = useVideoPlayer({ uri });
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const subscription = player.addListener("statusChange", ({ status }) => {
      setFailed(status === "error");
    });
    return () => subscription.remove();
  }, [player]);

  return (
    <View style={[styles.viewerVideo, { height }]}>
      <VideoView
        player={player}
        nativeControls
        allowsFullscreen
        style={[StyleSheet.absoluteFillObject, { backgroundColor: palette.foreground }]}
      />
      {failed && (
        <Text style={[styles.videoError, { color: palette.conversationPrimaryForeground }]} accessibilityRole="alert">
          Playback could not be loaded. The original remains available from the download icon.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: { alignSelf: "stretch", marginBottom: 8 },
  previewPressable: { alignSelf: "flex-start", maxWidth: "100%", overflow: "hidden", borderRadius: 14, borderWidth: 1 },
  imagePreview: { backgroundColor: designTokens.color.callScrim },
  loadingPreview: { alignItems: "center", justifyContent: "center", gap: 8 },
  previewHint: { fontSize: 11, fontFamily: "Inter_500Medium" },
  videoPreview: { overflow: "hidden", backgroundColor: designTokens.color.callScrim },
  videoFrame: { ...StyleSheet.absoluteFillObject },
  videoPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 8 },
  videoHint: { fontSize: 11, fontFamily: "Inter_500Medium" },
  playAffordance: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  playBadge: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(20, 12, 18, 0.6)" },
  durationBadge: { position: "absolute", bottom: 9, left: 9, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: "rgba(20, 12, 18, 0.7)" },
  durationText: { color: designTokens.color.card, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  documentPreview: { minHeight: 76, borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  documentIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  documentText: { flex: 1, minWidth: 0, gap: 3 },
  documentType: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  documentDetails: { fontSize: 10, fontFamily: "Inter_400Regular", textTransform: "capitalize" },
  viewer: { flex: 1 },
  viewerHeader: { minHeight: 64, paddingHorizontal: 10, paddingBottom: 8, flexDirection: "row", alignItems: "center", gap: 6 },
  viewerIcon: { width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  viewerTitle: { flex: 1, minWidth: 0, gap: 2 },
  viewerFileName: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  viewerDetails: { fontSize: 10, fontFamily: "Inter_400Regular", opacity: 0.76 },
  viewerContent: { flex: 1, justifyContent: "center" },
  viewerStatus: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 28 },
  viewerStatusText: { maxWidth: 340, fontSize: 13, lineHeight: 20, textAlign: "center", fontFamily: "Inter_400Regular" },
  retryPreview: { fontSize: 13, fontFamily: "Inter_600SemiBold", padding: 10 },
  imageViewer: { flex: 1 },
  imageViewerContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  viewerVideo: { width: "100%", justifyContent: "center" },
  videoError: { position: "absolute", bottom: 18, alignSelf: "center", paddingHorizontal: 14, fontSize: 12, textAlign: "center", fontFamily: "Inter_500Medium" },
  documentFallback: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 28 },
  fallbackIcon: { width: 72, height: 72, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  fallbackTitle: { fontSize: 17, fontFamily: "Sora_600SemiBold" },
});