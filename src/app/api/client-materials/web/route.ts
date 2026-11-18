import { materialAccess } from "@/server/client-materials/access";
import { splitText } from "@/server/client-materials/files";
import { readWebPage } from "@/server/client-materials/web";

// Fetching one page waits at most 8 seconds per hop.
export const maxDuration = 30;

/**
 * Reads a client's public web page into text, returned in source-sized parts
 * for the person to keep as sources. Only public addresses are fetched.
 *
 * application/json: studioId, clientId, url.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { studioId?: unknown; clientId?: unknown; url?: unknown } | null;
  const access = await materialAccess(request, body?.studioId, body?.clientId);
  if (!access.ok) return access.response;
  if (typeof body?.url !== "string" || !body.url.trim() || body.url.length > 2000) return Response.json({ error: "Type a web address." }, { status: 400 });
  const page = await readWebPage(body.url);
  if (!page.ok) return Response.json({ error: page.message }, { status: 422 });
  return Response.json({ kind: "text", title: page.title, url: page.url, parts: splitText(page.text) });
}
