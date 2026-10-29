import { createClient } from "@supabase/supabase-js";
import { aiMonthlyBudget, serverSupabase } from "@/server/config";

/**
 * This month's AI spend across all agents. Only a studio's owners may see it,
 * because the budget is shared by everything on this server.
 */
export async function GET(request: Request) {
  const supabase = serverSupabase();
  if (!supabase.ok) return json(503, supabase.reason);
  const budget = aiMonthlyBudget();
  if (!budget.ok) return json(503, budget.reason);
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json(401, "Sign in to see AI spend.");
  const studioId = new URL(request.url).searchParams.get("studioId") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(studioId)) return json(400, "The request was not understood.");

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
  if (membership?.role !== "owner") return json(403, "Only owners can see AI spend.");

  const asRunner = createClient(supabase.url, supabase.serviceRoleKey, options);
  const { data, error } = await asRunner.rpc("ai_budget_month");
  if (error) {
    console.error("AI spend could not be read", error.code);
    return json(500, "AI spend could not be loaded. Try again.");
  }
  const month = data as { month: string; spent: number; reserved: number };
  return Response.json(
    { month: month.month, spentMicros: Number(month.spent), reservedMicros: Number(month.reserved), capMicros: budget.capMicros },
    { headers: { "cache-control": "no-store" } },
  );
}

function json(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "cache-control": "no-store" } });
}
