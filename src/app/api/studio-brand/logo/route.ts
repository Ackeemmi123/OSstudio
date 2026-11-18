import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { BRAND_LOGO_BUCKET, MAX_BRAND_LOGO_BYTES } from "@/lib/domain/agency-brand";
import { serverSupabase } from "@/server/config";
import { materialType } from "@/server/client-materials/files";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

function fail(status: number, error: string) {
  return Response.json({ error }, { status });
}

/**
 * Stores the agency's logo for its brand. Owners only. The logo is public,
 * since it is shown on pages anyone with a preview link can open; the
 * returned path is then saved with the brand (update_studio_brand).
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return fail(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return fail(401, "Sign in to change the agency brand.");
  const form = await request.formData().catch(() => null);
  const studioId = form?.get("studioId");
  const file = form?.get("file");
  if (typeof studioId !== "string" || !UUID.test(studioId) || !(file instanceof Blob)) return fail(400, "The request was not understood.");
  if (file.size === 0 || file.size > MAX_BRAND_LOGO_BYTES) return fail(400, "The logo must be at most 512 KB.");

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return fail(401, "Your session has ended. Sign in again to continue.");
  const { data: membership } = await asUser.from("studio_members").select("role").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership) return fail(404, "This studio does not exist, or you do not have access to it.");
  if (membership.role !== "owner") return fail(403, "Only an owner can change the agency brand.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = materialType(bytes);
  if (type !== "image/png" && type !== "image/jpeg" && type !== "image/webp") return fail(400, "Use a PNG, JPEG or WebP image.");
  const path = `${studioId}/logo-${randomUUID()}.${EXTENSIONS[type]}`;
  const asServer = createClient(supabase.url, supabase.serviceRoleKey, options);
  const { error } = await asServer.storage.from(BRAND_LOGO_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) return fail(500, "The logo could not be stored. Try again.");
  return Response.json({ path });
}
