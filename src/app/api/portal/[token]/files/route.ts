import { portalDeps } from "@/server/portal/deps";
import { postPortalFiles } from "@/server/portal/portal";

// Up to ten files of 4 MB, each checked and stored.
export const maxDuration = 60;

/** A client's files, with their answers about rights and consent, from their portal. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const deps = portalDeps(new URL(request.url).origin);
  if (!deps) return Response.json({ error: "Not available." }, { status: 503 });
  return postPortalFiles((await params).token, await request.formData().catch(() => null), deps);
}
