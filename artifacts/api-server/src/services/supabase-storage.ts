import { createClient } from "@supabase/supabase-js";
import path from "path";
import ws from "ws";

const BUCKET = "perfusion-uploads";
const CASE_FILE_BUCKET = "perfusion-case-files";

function getClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are not set");
  }
  return createClient(supabaseUrl, supabaseKey, {
    realtime: {
      transport: ws as any,
    },
  });
}

export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  folder: string,
  mimeType: string
): Promise<string> {
  const client = getClient();
  const ext = path.extname(originalName);
  const uniqueName = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  const { error } = await client.storage
    .from(BUCKET)
    .upload(uniqueName, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) throw new Error(`Supabase upload failed: ${error.message}`);

  const { data } = client.storage.from(BUCKET).getPublicUrl(uniqueName);
  return data.publicUrl;
}

export function isSupabaseUrl(url: string): boolean {
  return url.startsWith("https://") && url.includes("supabase");
}

async function ensureCaseFileBucket(client: ReturnType<typeof getClient>) {
  const { data, error } = await client.storage.getBucket(CASE_FILE_BUCKET);
  if (data) {
    if (data.public) throw new Error(`Private Case File bucket ${CASE_FILE_BUCKET} is configured as public`);
    return;
  }
  if (error && !/not found|does not exist/i.test(error.message)) {
    throw new Error(`Unable to inspect private Case File bucket: ${error.message}`);
  }
  const created = await client.storage.createBucket(CASE_FILE_BUCKET, { public: false });
  if (created.error && !/already exists/i.test(created.error.message)) {
    throw new Error(`Unable to create private Case File bucket: ${created.error.message}`);
  }
}

export async function uploadPrivateCaseFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<string> {
  const client = getClient();
  await ensureCaseFileBucket(client);
  const ext = path.extname(originalName);
  const objectPath = `attachments/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const { error } = await client.storage.from(CASE_FILE_BUCKET).upload(objectPath, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw new Error(`Private Case File upload failed: ${error.message}`);
  return objectPath;
}

export async function downloadPrivateCaseFile(objectPath: string): Promise<Blob> {
  const client = getClient();
  await ensureCaseFileBucket(client);
  const { data, error } = await client.storage.from(CASE_FILE_BUCKET).download(objectPath);
  if (error || !data) throw new Error(`Private Case File download failed: ${error?.message || "empty response"}`);
  return data;
}

export async function createPrivateCaseFileSignedUrl(
  objectPath: string,
  expiresInSeconds = 300,
  downloadName?: string,
): Promise<string> {
  const client = getClient();
  await ensureCaseFileBucket(client);
  const { data, error } = await client.storage
    .from(CASE_FILE_BUCKET)
    .createSignedUrl(objectPath, expiresInSeconds, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) {
    throw new Error(`Private Case File download link failed: ${error?.message || "empty signed URL"}`);
  }
  return data.signedUrl;
}

export async function deletePrivateCaseFile(objectPath: string): Promise<void> {
  const client = getClient();
  await ensureCaseFileBucket(client);
  const { error } = await client.storage.from(CASE_FILE_BUCKET).remove([objectPath]);
  if (error) throw new Error(`Private Case File cleanup failed: ${error.message}`);
}

export async function downloadLegacyCaseFile(publicUrl: string): Promise<Blob> {
  const configuredUrl = process.env.SUPABASE_URL;
  if (!configuredUrl) throw new Error("Supabase storage is not configured");
  let expectedOrigin: string;
  let parsed: URL;
  try {
    expectedOrigin = new URL(configuredUrl).origin;
    parsed = new URL(publicUrl);
  } catch {
    throw new Error("Unsupported legacy attachment URL");
  }
  const prefix = `/storage/v1/object/public/${BUCKET}/`;
  if (parsed.origin !== expectedOrigin || !parsed.pathname.startsWith(prefix) || parsed.search || parsed.hash) {
    throw new Error("Unsupported legacy attachment URL");
  }
  const objectPath = decodeURIComponent(parsed.pathname.slice(prefix.length));
  if (!objectPath || objectPath.includes("..") || objectPath.startsWith("/")) {
    throw new Error("Unsupported legacy attachment path");
  }
  const client = getClient();
  const { data, error } = await client.storage.from(BUCKET).download(objectPath);
  if (error || !data) throw new Error(`Legacy Case File download failed: ${error?.message || "empty response"}`);
  if (data.size > 25 * 1024 * 1024) throw new Error("Legacy attachment exceeds download limit");
  return data;
}
