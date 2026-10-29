import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import { agentModel, aiMonthlyBudget, serverSupabase } from "@/server/config";
import type { AgentModel } from "./model";

export type AgentRequest<T> =
  | { ok: false; response: Response }
  | { ok: true; data: T; userId: string; asUser: SupabaseClient; asRunner: SupabaseClient; model: AgentModel; capMicros: number };

/**
 * Checks a request to run an agent: the server is configured, the body
 * parses, and the caller is an owner or member of the studio. Viewers may
 * not run agents. `action` completes "Sign in to …" and "Viewers cannot …".
 */
export async function agentRequest<T extends { studioId: string }>(request: Request, body: z.ZodType<T>, action: string): Promise<AgentRequest<T>> {
  const supabase = serverSupabase();
  if (!supabase.ok) return fail(503, supabase.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return fail(401, `Sign in to ${action}.`);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "The request was not understood.");

  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const asUser = createClient(supabase.url, supabase.anonKey, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: auth, error: authError } = await asUser.auth.getUser(token);
  if (authError || !auth.user) return fail(401, "Your session has ended. Sign in again to continue.");

  const { data: membership, error: membershipError } = await asUser
    .from("studio_members")
    .select("role")
    .eq("studio_id", parsed.data.studioId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (membershipError) return fail(500, "Your access could not be checked. Try again.");
  if (!membership) return fail(404, "This client does not exist, or you do not have access to it.");
  if (membership.role === "viewer") return fail(403, `Viewers cannot ${action}. Ask an owner for member access.`);

  const model = agentModel();
  if (!model.ok) return fail(503, model.reason);
  const budget = aiMonthlyBudget();
  if (!budget.ok) return fail(503, budget.reason);

  const asRunner = createClient(supabase.url, supabase.serviceRoleKey, options);
  return { ok: true, data: parsed.data, userId: auth.user.id, asUser, asRunner, model: model.model, capMicros: budget.capMicros };
}

/** Logs only an error's code and message: a database error's details can quote the row, which holds client material. */
export function logAgentError(what: string, error: unknown) {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  console.error(what, { code: String(code ?? "unknown"), message: String(message ?? error) });
}

export function agentError(status: number, error: string) {
  return Response.json({ error }, { status });
}

function fail(status: number, error: string): AgentRequest<never> {
  return { ok: false, response: agentError(status, error) };
}
