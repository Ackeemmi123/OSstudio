import { z } from "zod";
import { agentError, logAgentError, memberRequest } from "@/server/agents/agent-request";
import { fetchPublicPage, publicUrl } from "@/server/benchmark/fetch-page";
import { measureSpeed } from "@/server/benchmark/pagespeed";
import { runBenchmark } from "@/server/benchmark/runner";
import { SupabaseBenchmarkStore } from "@/server/benchmark/supabase-benchmark-store";

// Google's speed test takes up to about a minute per page; the pages run side by side.
export const maxDuration = 180;

const body = z.object({ studioId: z.uuid(), clientId: z.uuid(), projectId: z.uuid(), competitors: z.array(z.string().max(300)).min(1).max(3) });

/**
 * Compares the project's site with competitors' public sites. Owners and
 * members may ask. Uses no AI and changes nothing; the comparison is stored
 * as a run for everyone in the studio to read.
 */
export async function POST(request: Request) {
  const checked = await memberRequest(request, body, "compare with competitors");
  if (!checked.ok) return checked.response;
  const { data, userId, asUser, asRunner } = checked;
  try {
    const outcome = await runBenchmark({
      store: new SupabaseBenchmarkStore(asUser, asRunner, data.studioId),
      tools: { fetchPage: (url) => fetchPublicPage(url), measureSpeed: (url) => measureSpeed(url), checkUrl: (url) => publicUrl(url).toString() },
      clientId: data.clientId,
      projectId: data.projectId,
      competitors: data.competitors,
      origin: new URL(request.url).origin,
      requestedBy: userId,
    });
    return Response.json(outcome.body, { status: outcome.status });
  } catch (error) {
    logAgentError("Competitor comparison failed", error);
    return agentError(500, "The comparison could not be recorded. Try again.");
  }
}
