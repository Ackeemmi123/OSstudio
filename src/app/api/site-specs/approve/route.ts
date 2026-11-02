import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RepositoryError, SiteSpecBlockedError } from "@/lib/data/repository";
import { toRepositoryError } from "@/lib/data/supabase-errors";
import { SupabaseRepository } from "@/lib/data/supabase-repository";
import { logAgentError } from "@/server/agents/agent-request";
import { serverSupabase } from "@/server/config";

// One check and one write.
export const maxDuration = 30;

const body = z.object({ studioId: z.uuid(), specId: z.uuid(), expectedUpdatedAt: z.string().min(1).max(64) });

const STATUS = { session: 401, permission: 403, not_found: 404, conflict: 409, validation: 422 } as const;

function error(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

/**
 * Approves a website spec version for the signed-in person, after checking it
 * here: the browser's own check can be skipped, this one cannot. The rules run
 * on what is stored (approvalBlockers), and only this server (service role)
 * can record the pass the database asks for. The approval itself is written as
 * the person, so every other database rule applies and it carries their name.
 *
 * application/json: studioId, specId, expectedUpdatedAt.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return error(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return error(401, "Sign in to approve website specs.");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error(400, "The request was not understood.");
  const { studioId, specId, expectedUpdatedAt } = parsed.data;

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return error(401, "Your session has ended. Sign in again to continue.");
  const { data: membership, error: membershipError } = await asUser.from("studio_members").select("role").eq("studio_id", studioId).eq("user_id", auth.user.id).maybeSingle();
  if (membershipError) return error(500, "Your access could not be checked. Try again.");
  if (!membership) return error(404, "This website spec no longer exists, or you do not have access to it.");
  if (membership.role === "viewer") return error(403, "Viewers cannot approve website specs. Ask an owner for member access.");

  const userId = auth.user.id;
  const asServer = createClient(supabase.url, supabase.serviceRoleKey, options);
  const repository = new SupabaseRepository({ client: asUser, studioId, user: { id: userId, email: auth.user.email ?? null } });
  try {
    const record = await repository.approveCheckedSiteSpec(specId, expectedUpdatedAt, async () => {
      const { error: rpcError } = await asServer.rpc("record_site_spec_check", { p_spec: specId, p_person: userId });
      // Someone else may have approved it a moment ago.
      if (rpcError) throw toRepositoryError(rpcError);
    });
    return Response.json({ id: record.id, status: record.status });
  } catch (failure) {
    if (failure instanceof SiteSpecBlockedError) return Response.json({ error: failure.message, blockers: failure.blockers }, { status: 422 });
    if (failure instanceof RepositoryError && failure.code in STATUS) return error(STATUS[failure.code as keyof typeof STATUS], failure.message);
    logAgentError("Website spec approval failed", failure);
    return error(500, "The website spec could not be approved. Try again in a moment.");
  }
}
