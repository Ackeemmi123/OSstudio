import { isUuid, publishAccess } from "@/server/publish/access";
import { HostingError } from "@/server/publish/vercel";

/** Whether a published site's domain points at it yet, and what DNS records it needs. application/json: studioId, publicationId. */
export async function POST(request: Request) {
  const access = await publishAccess(request);
  if (!access.ok) return access.response;
  const { body, studioId, asUser, hosting } = access;
  if (!isUuid(body.publicationId)) return Response.json({ error: "The request was not understood." }, { status: 400 });
  const { data: row } = await asUser.from("site_publications").select("hosting_project, domain").eq("id", body.publicationId).eq("studio_id", studioId).maybeSingle();
  if (!row?.domain) return Response.json({ error: "This publication has no domain." }, { status: 404 });
  try {
    return Response.json(await hosting.domainStatus(row.hosting_project, row.domain));
  } catch (failure) {
    return Response.json({ error: failure instanceof HostingError ? failure.message : "The domain could not be checked." }, { status: 502 });
  }
}
