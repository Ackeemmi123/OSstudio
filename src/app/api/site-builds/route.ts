import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { STORAGE_BUCKET } from "@/lib/site-assets/limits";
import { logAgentError } from "@/server/agents/agent-request";
import { serverSupabase } from "@/server/config";
import { BUILD_BUCKET, BuildRefused, buildSite, type StoredImage } from "@/server/site-builds/build";

// Fetches the images, builds, checks and stores a site: a minute is plenty for a few dozen images.
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function error(status: number, message: string, checks: unknown[] = []) {
  return Response.json({ error: message, checks }, { status });
}

/**
 * Builds one website spec version with its design system and stores the
 * site privately, behind a link that expires. The person's access is checked
 * with their own session; only then does the server read the images and
 * store the files.
 *
 * application/json: studioId, specId.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to build a site.");
  const body = (await request.json().catch(() => null)) as { studioId?: unknown; specId?: unknown } | null;
  const studioId = body?.studioId;
  const specId = body?.specId;
  if (typeof studioId !== "string" || !UUID.test(studioId) || typeof specId !== "string" || !UUID.test(specId)) return error(400, "The request was not understood.");

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership, error: membershipError } = await asUser.from("studio_members").select("role, display_name").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (membershipError) return error(500, "Your access could not be checked. Try again.");
  if (!membership) return error(404, "This website spec does not exist, or you do not have access to it.");
  if (membership.role === "viewer") return error(403, "Viewers cannot build sites. Ask an owner for member access.");

  // Read as the person, so the database decides what they may see.
  const { data: record, error: specError } = await asUser.from("site_specs").select("id, studio_id, client_id, project_id, version, spec").eq("id", specId).eq("studio_id", studioId).maybeSingle();
  if (specError) return error(500, "The website spec could not be read. Try again.");
  if (!record) return error(404, "This website spec does not exist, or you do not have access to it.");

  const actor = { kind: "human", name: String(membership.display_name ?? auth.user.email ?? "Studio member"), userId: auth.user.id };
  const asServer = createClient(supabase.url, supabase.serviceRoleKey, options);
  try {
    const site = await buildSite(
      { studioId, specVersion: record.version, spec: record.spec },
      {
        images: async (ids) => {
          if (!ids.length) return [];
          const { data, error: readError } = await asUser.from("site_assets").select("id, storage_path, mime_type, status").eq("studio_id", studioId).eq("client_id", record.client_id).in("id", ids);
          if (readError) throw readError;
          return (data ?? []).map((row) => ({ id: row.id, storagePath: row.storage_path, mimeType: row.mime_type, status: row.status }) as StoredImage);
        },
        download: async (path) => {
          const { data, error: downloadError } = await asServer.storage.from(STORAGE_BUCKET).download(path);
          if (downloadError || !data) throw downloadError ?? new Error("Empty image.");
          return new Uint8Array(await data.arrayBuffer());
        },
        now: () => new Date(),
      },
    );

    for (const file of site.files) {
      const { error: storeError } = await asServer.storage.from(BUILD_BUCKET).upload(`${site.storagePrefix}/${file.path}`, file.body, { contentType: file.contentType, upsert: false });
      if (storeError) throw storeError;
    }
    const { error: insertError } = await asServer.from("site_builds").insert({
      id: site.id,
      studio_id: studioId,
      client_id: record.client_id,
      project_id: record.project_id,
      spec_id: record.id,
      spec_version: record.version,
      design_system: site.designSystem,
      storage_prefix: site.storagePrefix,
      file_count: site.files.length,
      byte_count: site.files.reduce((sum, file) => sum + file.body.byteLength, 0),
      checks: site.checks,
      share_token: site.shareToken,
      expires_at: site.expiresAt.toISOString(),
      created_by: actor,
    });
    if (insertError) throw insertError;

    const event = {
      id: randomUUID(),
      entity_type: "client",
      entity_id: record.client_id,
      event_type: "site_spec.built",
      description: `Built website spec v${record.version} with ${site.designSystem}`,
      actor,
      timestamp: new Date().toISOString(),
    };
    await asUser.rpc("apply_changes", { p_studio: studioId, p_changes: { events: [event] } });

    return Response.json({ id: site.id, link: `/s/${site.shareToken}/`, expiresAt: site.expiresAt.toISOString(), checks: site.checks }, { status: 201 });
  } catch (failure) {
    if (failure instanceof BuildRefused) return error(422, failure.message, failure.checks);
    logAgentError("Site build failed", failure);
    return error(500, "The site could not be built. Try again.");
  }
}
