import { createClient } from "@supabase/supabase-js";
import path from "path";
import ws from "ws";

const BUCKET = "perfusion-uploads";

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
