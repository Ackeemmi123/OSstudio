import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverSupabase } from "@/server/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Access =
  | { ok: true; asUser: SupabaseClient; asServer: SupabaseClient; actor: { kind: "human"; name: string; userId: string } }
  | { ok: false; response: Response };

function error(status: number, message: string): { ok: false; response: Response } {
  return { ok: false, response: Response.json({ error: message }, { status }) };
}

/**
 * Checks, with the person's own session, that they may add material for this
 * client: a member of the studio who is not a viewer, and a client the
 * database lets them see. Only then is the service role handed out.
 */
export async function materialAccess(request: Request, studioId: unknown, clientId: unknown): Promise<Access> {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to add material.");
  if (typeof studioId !== "string" || !UUID.test(studioId) || typeof clientId !== "string" || !UUID.test(clientId)) return error(400, "The request was not understood.");
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership, error: membershipError } = await asUser.from("studio_members").select("role, display_name").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (membershipError) return error(500, "Your access could not be checked. Try again.");
  if (!membership) return error(404, "This client does not exist, or you do not have access to it.");
  if (membership.role === "viewer") return error(403, "Viewers cannot add material. Ask an owner for member access.");
  const { data: client } = await asUser.from("clients").select("id").eq("id", clientId).eq("studio_id", studioId).maybeSingle();
  if (!client) return error(404, "This client does not exist, or you do not have access to it.");
  return {
    ok: true,
    asUser,
    asServer: createClient(supabase.url, supabase.serviceRoleKey, options),
    actor: { kind: "human", name: String(membership.display_name ?? auth.user.email ?? "Studio member"), userId: auth.user.id },
  };
}
