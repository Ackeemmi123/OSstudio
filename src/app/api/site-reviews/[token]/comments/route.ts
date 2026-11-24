import { reviewDeps } from "@/server/site-reviews/deps";
import { postComment } from "@/server/site-reviews/review";

/** A client's comment on a page of the preview. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const deps = reviewDeps(new URL(request.url).origin);
  if (!deps) return Response.json({ error: "Not available." }, { status: 503 });
  return postComment((await params).token, await request.json().catch(() => null), deps);
}
