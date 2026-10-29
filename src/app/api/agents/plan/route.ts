import { z } from "zod";
import { PROJECT_TYPES } from "@/lib/domain/types";
import { agentError, agentRequest, logAgentError } from "@/server/agents/agent-request";
import { runTaskSuggestions } from "@/server/agents/plan-runner";
import { SupabaseIntakeStore } from "@/server/agents/supabase-intake-store";
import { intakeTimeoutMs } from "@/server/config";

// One model call per request, bounded by STUDIO_AGENT_TIMEOUT_MS (at most 110 s).
export const maxDuration = 120;

const body = z.object({ studioId: z.uuid(), clientId: z.uuid(), projectType: z.enum(PROJECT_TYPES) });

/**
 * Suggests changes to a new project's starting tasks, from the client's
 * brief. Only owners and members may ask. Nothing is created: the person
 * picks from the suggestions when they create the project.
 */
export async function POST(request: Request) {
  const checked = await agentRequest(request, body, "ask for suggestions");
  if (!checked.ok) return checked.response;
  const { data, userId, asUser, asRunner, model, capMicros } = checked;
  try {
    const outcome = await runTaskSuggestions({
      store: new SupabaseIntakeStore(asUser, asRunner, data.studioId, { id: "coordination", taskType: "coordination.plan" }),
      model,
      clientId: data.clientId,
      projectType: data.projectType,
      requestedBy: userId,
      timeoutMs: intakeTimeoutMs(),
      capMicros,
    });
    return Response.json(outcome.body, { status: outcome.status });
  } catch (error) {
    logAgentError("Task suggestions failed", error);
    return agentError(500, "The suggestions could not be recorded. Try again.");
  }
}
