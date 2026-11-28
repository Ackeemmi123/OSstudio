import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { logAgentError } from "@/server/agents/agent-request";
import { serverSupabase } from "@/server/config";
import { BUILD_BUCKET, BuildRefused, buildSite } from "@/server/site-builds/build";
import { buildDeps } from "@/server/site-builds/deps";

// Fetches the images, makes each into WebP at a few widths (about a second for a full-size photo),
// builds, checks and stores a site. The build itself stops making pictures smaller after 40 seconds.
export const maxDuration = 120;

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
    // The prototype names the agency in its own brand, never Studio OS.
    const { data: studio } = await asUser.from("studios").select("name, brand").eq("id", studioId).maybeSingle();
    const madeBy = String((studio?.brand as { name?: string } | null)?.name || studio?.name || "").trim() || undefined;
    const site = await buildSite(
      { studioId, specVersion: record.version, spec: record.spec, madeBy },
      buildDeps(asUser, asServer, studioId, record.client_id),
    );

    // A few at a time: each picture is now several small files, and one by one they would add up.
    for (let i = 0; i < site.files.length; i += 6) {
      await Promise.all(
        site.files.slice(i, i + 6).map(async (file) => {
          const { error: storeError } = await asServer.storage.from(BUILD_BUCKET).upload(`${site.storagePrefix}/${file.path}`, file.body, { contentType: file.contentType, upsert: false });
          if (storeError) throw storeError;
        }),
      );
    }
    const { error: insertError } = await asServer.rpc("record_site_build", { p_build: {
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
      // The quality report travels with the checks, marked by its level.
      checks: [...site.checks, site.quality],
      share_token: site.shareToken,
      expires_at: site.expiresAt.toISOString(),
      created_by: actor,
    } });
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
