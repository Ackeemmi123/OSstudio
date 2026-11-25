import { z } from "zod";
import { agentError, agentRequest, logAgentError, withoutAiConsent } from "@/server/agents/agent-request";
import { runSiteDraft } from "@/server/agents/site-draft-runner";
import { SupabaseSiteDraftStore } from "@/server/agents/supabase-site-draft-store";

// One long model call: the draft writes a whole website, so it may take a few minutes.
export const maxDuration = 300;

const body = z.object({ studioId: z.uuid(), clientId: z.uuid(), projectId: z.uuid(), force: z.boolean().optional(), aiConsent: z.boolean().optional() });

/**
 * Drafts a project's website spec from the client's material. Only owners
 * and members may ask. Nothing in the project changes: the draft is stored
 * on the run for a person to review.
 */
export async function POST(request: Request) {
  const checked = await agentRequest(request, body, "draft a website");
  if (!checked.ok) return checked.response;
  const { data, userId, asUser, asRunner, model, capMicros } = checked;
  const refused = withoutAiConsent(data);
  if (refused) return refused;
  try {
    const outcome = await runSiteDraft({
      store: new SupabaseSiteDraftStore(asUser, asRunner, data.studioId),
      model,
      clientId: data.clientId,
      projectId: data.projectId,
      requestedBy: userId,
      force: data.force ?? false,
      timeoutMs: 285_000,
      capMicros,
    });
    return Response.json(outcome.body, { status: outcome.status });
  } catch (error) {
    logAgentError("Website draft failed", error);
    return agentError(500, "The draft could not be recorded. Try again.");
  }
}
