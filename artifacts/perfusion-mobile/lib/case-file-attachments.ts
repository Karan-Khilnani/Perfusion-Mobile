import * as DocumentPicker from "expo-document-picker";
import { File as ExpoFile } from "expo-file-system";
import { fetch as expoFetch } from "expo/fetch";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import { getBaseUrl, getStoredCookie } from "@/hooks/useApi";

export type AttachmentSource = "camera" | "photo_gallery" | "document";
export type AttachmentCategory = "lab" | "radiology" | "treatment_chart" | "general";
export type AttachmentDraft = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  source: AttachmentSource;
  webFile?: globalThis.File;
};

const MAX_SIZE = 25 * 1024 * 1024;
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
  if (draft.size && draft.size > MAX_SIZE) throw new Error("Choose a file smaller than 25 MB.");
  if (!ALLOWED_MIME.has(draft.mimeType) && !ALLOWED_EXTENSIONS.has(extension || "")) {
    throw new Error("Choose a PDF, image, DICOM, DOC, or DOCX file.");
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
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    return validateDraft({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType || (asset.name.toLowerCase().endsWith(".dcm") ? "application/dicom" : "application/octet-stream"),
      size: asset.size,
      webFile: asset.file,
      source,
    });
  }

  if (source === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error("Camera access is needed. Allow it in your device settings, or choose another source.");
  } else if (Platform.OS !== "web") {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) throw new Error("Photo access is needed. Allow it in your device settings, or choose another source.");
  }
  const result = source === "camera"
    ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.9 })
    : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
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
  return validateDraft({
    uri: asset.uri,
    name: asset.fileName || `clinical-photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType || "image/jpeg",
    size: asset.fileSize,
    webFile: asset.file,
    source,
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