import { z } from "zod";
import { agentError, agentRequest, logAgentError } from "@/server/agents/agent-request";
import { runIntakeAnalysis } from "@/server/agents/intake-runner";
import { SupabaseIntakeStore } from "@/server/agents/supabase-intake-store";
import { intakeTimeoutMs } from "@/server/config";

// One model call per request, bounded by STUDIO_AGENT_TIMEOUT_MS (at most 110 s).
export const maxDuration = 120;

const body = z.object({ studioId: z.uuid(), clientId: z.uuid(), force: z.boolean().optional(), aiConsent: z.boolean().optional() });

/**
 * Starts (or reuses) an intake analysis for one client. Only owners and
 * members of the client's studio may ask; the result is a set of proposals
 * that a person reviews in the client workspace. Nothing is sent to the
 * model unless the person confirmed the client agreed to it.
 */
export async function POST(request: Request) {
  const checked = await agentRequest(request, body, "run analyses");
  if (!checked.ok) return checked.response;
  const { data, userId, asUser, asRunner, model, capMicros } = checked;
  // Checked after access, so a stranger still learns nothing about the client.
  if (data.aiConsent !== true) return agentError(400, "Confirm that the client agreed to AI processing of their material first.");
  try {
    const outcome = await runIntakeAnalysis({
      store: new SupabaseIntakeStore(asUser, asRunner, data.studioId),
      model,
      clientId: data.clientId,
      requestedBy: userId,
      force: data.force,
      timeoutMs: intakeTimeoutMs(),
      capMicros,
    });
    return Response.json(outcome.body, { status: outcome.status });
  } catch (error) {
    logAgentError("Intake analysis failed", error);
    return agentError(500, "The analysis could not be recorded. Try again.");
  }
}
