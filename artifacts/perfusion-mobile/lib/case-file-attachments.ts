import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { createVideoPlayer } from "expo-video";
import { Platform } from "react-native";

import { getBaseUrl, getStoredCookie } from "@/hooks/useApi";

export type AttachmentSource = "camera" | "photo_gallery" | "document" | "video_camera" | "video_gallery";
export type AttachmentCategory = "lab" | "radiology" | "treatment_chart" | "general";
export type AttachmentDraft = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  source: AttachmentSource;
  webFile?: globalThis.File;
  durationSeconds?: number;
};

const MAX_SIZE = 25 * 1024 * 1024;
const MAX_VIDEO_SIZE = 75 * 1024 * 1024;
export const isVideoDraft = (draft: Pick<AttachmentDraft, "mimeType" | "name">) =>
  /^video\/(mp4|quicktime|webm)$/i.test(draft.mimeType) || /\.(mp4|mov|webm)$/i.test(draft.name);

export async function getVideoDuration(uri: string): Promise<number> {
  if (Platform.OS === "web") {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => { const duration = video.duration; video.src = ""; resolve(duration); };
      video.onerror = () => { video.src = ""; reject(new Error("Could not read video duration.")); };
      video.src = uri;
    });
  }
  const player = createVideoPlayer({ uri });
  try {
    if (player.status === "readyToPlay") return player.duration;
    return await new Promise<number>((resolve, reject) => {
      const timeout = setTimeout(() => { subscription.remove(); reject(new Error("Could not read video duration.")); }, 12000);
      const subscription = player.addListener("statusChange", ({ status }) => {
        if (status === "readyToPlay" || status === "error") {
          clearTimeout(timeout);
          subscription.remove();
          if (status === "error") reject(new Error("Could not read video duration."));
          else resolve(player.duration);
        }
      });
    });
  } finally {
    player.release();
  }
}
const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "application/dicom",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "gif", "dcm", "doc", "docx"]);

function validateDraft(draft: AttachmentDraft): AttachmentDraft {
  const extension = draft.name.toLowerCase().split(".").pop();
  if (draft.size && draft.size > (isVideoDraft(draft) ? MAX_VIDEO_SIZE : MAX_SIZE)) throw new Error(isVideoDraft(draft) ? "Choose a video smaller than 75 MB." : "Choose a file smaller than 25 MB.");
  if (isVideoDraft(draft)) return draft;
  if (!ALLOWED_MIME.has(draft.mimeType) && !ALLOWED_EXTENSIONS.has(extension || "")) {
    throw new Error("Choose a PDF, image, DICOM, DOC, or DOCX file.");
  }
  return draft;
}

async function validateSelected(draft: AttachmentDraft): Promise<AttachmentDraft> {
  validateDraft(draft);
  if (isVideoDraft(draft)) {
    const duration = draft.durationSeconds ?? await getVideoDuration(draft.uri);
    if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not read video duration.");
    if (duration > 120.05) throw new Error("Video must be 2 minutes or less.");
    draft.durationSeconds = duration;
  }
  return draft;
}

export async function pickCaseFileAttachment(source: AttachmentSource): Promise<AttachmentDraft | null> {
  if (source === "document") {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/gif",
        "application/dicom",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/octet-stream",
         "video/mp4",
         "video/quicktime",
         "video/webm",
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return validateSelected({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || (asset.name.toLowerCase().endsWith(".dcm") ? "application/dicom" : "application/octet-stream"),
      size: asset.size,
      webFile: asset.file,
      source,
    });
  }

  if (source === "camera" || source === "video_camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Camera access is needed. Allow it in your device settings, or choose another source.");
  } else if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error("Photo access is needed. Allow it in your device settings, or choose another source.");
  }
  const video = source === "video_camera" || source === "video_gallery";
  const result = source === "camera" || source === "video_camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: video ? ["videos"] : ["images"], quality: 0.9, videoMaxDuration: video ? 120 : undefined })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: video ? ["videos"] : ["images"], quality: 0.9 });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (["image/heic", "image/heif"].includes(asset.mimeType || "") && Platform.OS !== "web") {
    const converted = await ImageManipulator.manipulateAsync(asset.uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return validateDraft({
      uri: converted.uri,
      name: `clinical-photo-${Date.now()}.jpg`,
      mimeType: "image/jpeg",
      source,
    });
  }
  return validateSelected({
    uri: asset.uri,
    name: asset.fileName || (video ? `clinical-video-${Date.now()}.mp4` : `clinical-photo-${Date.now()}.jpg`),
    mimeType: asset.mimeType || (video ? "video/mp4" : "image/jpeg"),
    size: asset.fileSize,
    webFile: asset.file,
    source,
    durationSeconds: video && asset.duration ? asset.duration / 1000 : undefined,
  });
}

export async function uploadCaseFileAttachment(
  bookingId: string,
  draft: AttachmentDraft,
  category: AttachmentCategory | "uncategorized",
): Promise<void> {
  const form = new FormData();
  const file = Platform.OS === "web" && draft.webFile ? draft.webFile : new ExpoFile(draft.uri);
  form.append("file", file, draft.name);
  form.append("source", draft.source);
  form.append("category", category);
  const cookie = await getStoredCookie();
  const response = await expoFetch(`${getBaseUrl()}/api/bookings/${encodeURIComponent(bookingId)}/case-file/attachments`, {
    method: "POST",
    credentials: "include",
    headers: { "X-Mobile-Client": "1", ...(cookie ? { Cookie: cookie } : {}) },
    body: form,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Upload failed (${response.status}). Please try again.`);
  }
}