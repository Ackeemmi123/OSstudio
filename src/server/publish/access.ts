import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publishConfig, serverSupabase } from "@/server/config";
import { Vercel } from "./vercel";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublishAccess =
  | { ok: false; response: Response }
  | { ok: true; body: Record<string, unknown>; studioId: string; asUser: SupabaseClient; asServer: SupabaseClient; hosting: Vercel; actor: { kind: "human"; name: string; userId: string } };

const fail = (status: number, error: string): PublishAccess => ({ ok: false, response: Response.json({ error }, { status }) });

/**
 * Checks a request to publish or restore: the server is set up, the person
 * is signed in and an owner or member of the studio (not a viewer). Only
 * then are the service role and the hosting key used.
 */
export async function publishAccess(request: Request): Promise<PublishAccess> {
  const supabase = serverSupabase();
  if (!supabase.ok) return fail(503, supabase.reason);
  const hosting = publishConfig();
  if (!hosting.ok) return fail(503, hosting.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return fail(401, "Sign in to publish a site.");
  const body = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const studioId = body.studioId;
  if (typeof studioId !== "string" || !UUID.test(studioId)) return fail(400, "The request was not understood.");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return fail(401, "Your session has ended. Sign in again to continue.");
  const { data: membership } = await asUser.from("studio_members").select("role, display_name").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (!membership) return fail(404, "This site does not exist, or you do not have access to it.");
  if (membership.role === "viewer") return fail(403, "Viewers cannot publish sites. Ask an owner for member access.");
  return {
    ok: true,
    body,
    studioId,
    asUser,
    asServer: createClient(supabase.url, supabase.serviceRoleKey, options),
    hosting: new Vercel(hosting.token, hosting.teamId),
    actor: { kind: "human", name: String(membership.display_name ?? auth.user.email ?? "Studio member"), userId: auth.user.id },
  };
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
