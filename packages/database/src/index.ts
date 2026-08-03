import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
export function hasSupabaseConfig(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is missing");
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
export async function uploadScreenshot(path: string, dataUrl: string): Promise<string> {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(dataUrl);
  if (!match?.[1] || !match[2]) throw new Error("Unsupported screenshot data URL");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 8 * 1024 * 1024) throw new Error("Screenshot exceeds 8 MB");
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "spotpatch-feedback";
  const { error } = await getSupabase()
    .storage.from(bucket)
    .upload(path, bytes, { contentType: match[1], upsert: false });
  if (error) throw error;
  return path;
}
export async function createSignedScreenshotUrl(path: string, expires = 300): Promise<string> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "spotpatch-feedback";
  const { data, error } = await getSupabase().storage.from(bucket).createSignedUrl(path, expires);
  if (error) throw error;
  return data.signedUrl;
}
