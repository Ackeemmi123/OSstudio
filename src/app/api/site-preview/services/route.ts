import { createClient } from "@supabase/supabase-js";
import { servicesPreview } from "@/lib/site-spec/services-preview";
import { parseSiteSpec } from "@/lib/site-spec/validate";
import type { RenderImageFile } from "@/lib/site-render/model";
import { serverSupabase } from "@/server/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 2_000_000;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Draws one page of a spec with the company design for Studio OS's preview.
 * The design renders on the server (it uses React's server renderer), so the
 * preview asks for the page here. Nothing is stored; the person must be a
 * member of the studio.
 *
 * application/json: studioId, spec, images (file id → signed link, width, height), pageId.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to preview a site.");
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return error(413, "The spec is too large to preview.");
  const body = (() => {
    try {
      return JSON.parse(text) as { studioId?: unknown; spec?: unknown; images?: unknown; pageId?: unknown };
    } catch {
      return null;
    }
  })();
  const studioId = body?.studioId;
  if (typeof studioId !== "string" || !UUID.test(studioId) || typeof body?.pageId !== "string") return error(400, "The request was not understood.");

  const asUser = createClient(supabase.url, supabase.anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership } = await asUser.from("studio_members").select("role").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership) return error(404, "You do not have access to this studio.");

  const parsed = parseSiteSpec(body.spec);
  if (!parsed.ok) return error(422, "This is not a valid website spec.");
  const images: Record<string, RenderImageFile> = {};
  if (body.images && typeof body.images === "object") {
    for (const [id, file] of Object.entries(body.images as Record<string, Partial<RenderImageFile>>)) {
      if (typeof file?.url === "string" && /^https:\/\//.test(file.url)) images[id] = { url: file.url, width: Number(file.width) || 0, height: Number(file.height) || 0 } as RenderImageFile;
    }
  }
  const { data: studio } = await asUser.from("studios").select("name, brand").eq("id", studioId).maybeSingle();
  const madeBy = String((studio?.brand as { name?: string } | null)?.name || studio?.name || "").trim() || "the agency";
  try {
    return Response.json(servicesPreview(parsed.spec, images, body.pageId, madeBy));
  } catch (cause) {
    return Response.json({ missing: [cause instanceof Error ? cause.message : "The company design could not draw this spec."] });
  }
}
