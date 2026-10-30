import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/site-assets/limits";
import { logAgentError } from "@/server/agents/agent-request";
import { serverSupabase } from "@/server/config";
import { readProvenance, receiveSiteAssetUpload } from "@/server/site-assets/upload";

// One image of at most 3 MB: checked, stored and recorded.
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Receives one processed image from the website spec editor. The bytes are
 * checked here before anything is stored (src/lib/site-assets/inspect.ts);
 * the file is then stored as the signed-in person, so the storage policies
 * apply, and only this server (service role) marks it checked. A file sent
 * to Storage any other way is never usable.
 *
 * multipart/form-data: studioId, clientId, provenance (JSON), file.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to upload images.");

  const form = await request.formData().catch(() => null);
  const studioId = form?.get("studioId");
  const clientId = form?.get("clientId");
  const file = form?.get("file");
  let provenanceJson: unknown = null;
  try {
    provenanceJson = JSON.parse(String(form?.get("provenance") ?? "null"));
  } catch {
    provenanceJson = null;
  }
  const provenance = readProvenance(provenanceJson);
  if (typeof studioId !== "string" || !UUID.test(studioId) || typeof clientId !== "string" || !UUID.test(clientId) || !(file instanceof Blob) || !provenance) {
    return error(400, "The request was not understood.");
  }

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership, error: membershipError } = await asUser
    .from("studio_members")
    .select("role, display_name")
    .eq("studio_id", studioId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (membershipError) return error(500, "Your access could not be checked. Try again.");
  if (!membership) return error(404, "This client does not exist, or you do not have access to it.");
  if (membership.role === "viewer") return error(403, "Viewers cannot upload images. Ask an owner for member access.");
  // Read past the 3 MB limit only far enough to refuse.
  if (file.size > 4 * 1024 * 1024) return error(400, "The image is larger than 3 MB after processing.");

  const actor = { kind: "human", name: String(membership.display_name ?? auth.user.email ?? "Studio member"), userId: auth.user.id };
  const asServer = createClient(supabase.url, supabase.serviceRoleKey, options);
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const outcome = await receiveSiteAssetUpload(
      { bytes, declaredType: file.type, provenance },
      {
        begin: async (meta) => {
          const { data, error: rpcError } = await asUser.rpc("begin_site_asset_upload", { p_studio: studioId, p_client: clientId, p_asset: meta, p_actor: actor });
          if (rpcError) throw rpcError;
          return data as { id: string; storagePath: string | null; existing: boolean };
        },
        store: async (path, body, mimeType) => {
          const { error: storeError } = await asUser.storage.from(STORAGE_BUCKET).upload(path, body, { contentType: mimeType, upsert: false });
          if (storeError) throw storeError;
        },
        finish: async (id, measured) => {
          const { error: rpcError } = await asServer.rpc("finish_site_asset_upload", { p_asset: id, p_measured: measured });
          if (rpcError) throw rpcError;
        },
        recordUploaded: async (description) => {
          const event = {
            id: randomUUID(),
            entity_type: "client",
            entity_id: clientId,
            event_type: "site_asset.uploaded",
            description: `Uploaded image: ${description.slice(0, 120)}`,
            actor,
            timestamp: new Date().toISOString(),
          };
          const { error: rpcError } = await asUser.rpc("apply_changes", { p_studio: studioId, p_changes: { events: [event] } });
          if (rpcError) throw rpcError;
        },
      },
    );
    return Response.json(outcome.body, { status: outcome.status });
  } catch (failure) {
    logAgentError("Image upload failed", failure);
    const code = (failure as { code?: string })?.code;
    if (code === "53400") return error(409, (failure as { message?: string }).message ?? "The image limit is reached.");
    if (code === "22023") return error(400, (failure as { message?: string }).message ?? "The image was refused.");
    if (code === "42501") return error(403, "You cannot upload images for this client.");
    return error(500, "The image could not be stored. Try again.");
  }
}
