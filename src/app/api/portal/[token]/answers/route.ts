import { portalDeps } from "@/server/portal/deps";
import { postPortalAnswers } from "@/server/portal/portal";

/** A client's answers to the open questions, from their portal. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const deps = portalDeps(new URL(request.url).origin);
  if (!deps) return Response.json({ error: "Not available." }, { status: 503 });
  return postPortalAnswers((await params).token, await request.json().catch(() => null), deps);
}
