import { reviewDeps } from "@/server/site-reviews/deps";
import { postAnswers } from "@/server/site-reviews/review";

/** A client's answers to the studio's questions on the link. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const deps = reviewDeps(new URL(request.url).origin);
  if (!deps) return Response.json({ error: "Not available." }, { status: 503 });
  return postAnswers((await params).token, await request.json().catch(() => null), deps);
}
