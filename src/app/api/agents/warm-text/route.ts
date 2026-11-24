import { z } from "zod";
import { agentError, agentRequest, logAgentError } from "@/server/agents/agent-request";
import { SupabaseWarmTextStore } from "@/server/agents/supabase-warm-text-store";
import { runWarmText } from "@/server/agents/warm-text-runner";

// One model call over the site's texts; shorter than a draft, but it writes a fair amount.
export const maxDuration = 300;

const body = z.object({ studioId: z.uuid(), clientId: z.uuid(), projectId: z.uuid(), specId: z.uuid(), force: z.boolean().optional(), focus: z.array(z.string().max(200)).max(20).optional() });

/**
 * Proposes warmer wordings for a saved website spec's texts. Only owners and
 * members may ask. Nothing in the spec changes: the proposals are stored on
 * the run for a person to tick.
 */
export async function POST(request: Request) {
  const checked = await agentRequest(request, body, "improve the website's texts");
  if (!checked.ok) return checked.response;
  const { data, userId, asUser, asRunner, model, capMicros } = checked;
  try {
    const outcome = await runWarmText({
      store: new SupabaseWarmTextStore(asUser, asRunner, data.studioId),
      model,
      clientId: data.clientId,
      projectId: data.projectId,
      specId: data.specId,
      requestedBy: userId,
      force: data.force ?? false,
      focus: data.focus,
      timeoutMs: 285_000,
      capMicros,
    });
    return Response.json(outcome.body, { status: outcome.status });
  } catch (error) {
    logAgentError("Warmer-text pass failed", error);
    return agentError(500, "The pass could not be recorded. Try again.");
  }
}
