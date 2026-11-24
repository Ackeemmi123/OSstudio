import { createClient } from "@supabase/supabase-js";
import { parseSiteSpec } from "@/lib/site-spec/validate";
import { serverSupabase } from "@/server/config";
import { draftQuality } from "@/server/quality/draft-quality";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY = 2_000_000;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * The quality gate on a draft spec, drawn with its design on the server.
 * Nothing is stored; the person must be a member of the studio.
 *
 * application/json: studioId, spec.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to check a draft.");
  const text = await request.text().catch(() => "");
  if (text.length > MAX_BODY) return error(413, "The spec is too large to check.");
  let body: { studioId?: unknown; spec?: unknown } | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  const studioId = body?.studioId;
  if (typeof studioId !== "string" || !UUID.test(studioId)) return error(400, "The request was not understood.");

  const asUser = createClient(supabase.url, supabase.anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership } = await asUser.from("studio_members").select("role").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership) return error(404, "You do not have access to this studio.");

  const parsed = parseSiteSpec(body?.spec);
  if (!parsed.ok) return error(422, "This is not a valid website spec.");
  const { data: studio } = await asUser.from("studios").select("name, brand").eq("id", studioId).maybeSingle();
  const madeBy = String((studio?.brand as { name?: string } | null)?.name || studio?.name || "").trim() || "the agency";
  try {
    return Response.json({ report: draftQuality(parsed.spec, madeBy) });
  } catch (cause) {
    return Response.json({ report: { missing: [cause instanceof Error ? cause.message : "The design could not draw this spec."] } });
  }
}
