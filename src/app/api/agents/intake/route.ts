import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { SupabaseIntakeStore } from "@/server/agents/supabase-intake-store";
import { runIntakeAnalysis } from "@/server/agents/intake-runner";
import { intakeModel, intakeTimeoutMs, serverSupabase } from "@/server/config";

// One model call per request, bounded by STUDIO_AGENT_TIMEOUT_MS (at most 110 s).
export const maxDuration = 120;

const body = z.object({ studioId: z.uuid(), clientId: z.uuid(), force: z.boolean().optional() });

/**
 * Starts (or reuses) an intake analysis for one client. Only owners and
 * members of the client's studio may ask; the result is a set of proposals
 * that a person reviews in the client workspace.
 */
export async function POST(request: Request) {
  const supabase = serverSupabase();
  if (!supabase) return json(503, "The server is not connected to Supabase.");
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json(401, "Sign in to run an analysis.");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json(400, "The request was not understood.");
  const { studioId, clientId, force } = parsed.data;

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return json(401, "Your session has ended. Sign in again to continue.");

  const { data: membership, error: membershipError } = await asUser
    .from("studio_members")
    .select("role")
    .eq("studio_id", studioId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (membershipError) return json(500, "Your access could not be checked. Try again.");
  if (!membership) return json(404, "This client does not exist, or you do not have access to it.");
  if (membership.role === "viewer") return json(403, "Viewers cannot run analyses. Ask an owner for member access.");

  const model = intakeModel();
  if (!model.ok) return json(503, model.reason);

  const asRunner = createClient(supabase.url, supabase.serviceRoleKey, options);
  try {
    const outcome = await runIntakeAnalysis({
      store: new SupabaseIntakeStore(asUser, asRunner, studioId),
      model: model.model,
      clientId,
      requestedBy: auth.user.id,
      force,
      timeoutMs: intakeTimeoutMs(),
    });
    return Response.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("Intake analysis failed", error);
    return json(500, "The analysis could not be recorded. Try again.");
  }
}

function json(status: number, error: string) {
  return Response.json({ error }, { status });
}
