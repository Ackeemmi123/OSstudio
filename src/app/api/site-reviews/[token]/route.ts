import { reviewDeps } from "@/server/site-reviews/deps";
import { readReview } from "@/server/site-reviews/review";

/** What the review bar on a preview link shows: the comments and the approval, if any. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const deps = reviewDeps();
  if (!deps) return Response.json({ error: "Not available." }, { status: 503 });
  return readReview((await params).token, deps);
}
