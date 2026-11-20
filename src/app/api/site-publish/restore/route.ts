import { logAgentError } from "@/server/agents/agent-request";
import { isUuid, publishAccess } from "@/server/publish/access";
import { HostingError } from "@/server/publish/vercel";

/** Makes an earlier publication of a site live again. application/json: studioId, publicationId. */
export async function POST(request: Request) {
  const access = await publishAccess(request);
  if (!access.ok) return access.response;
  const { body, studioId, asUser, asServer, hosting } = access;
  if (!isUuid(body.publicationId)) return Response.json({ error: "The request was not understood." }, { status: 400 });
  const { data: row } = await asUser.from("site_publications").select("id, hosting_project, deployment_id, status").eq("id", body.publicationId).eq("studio_id", studioId).maybeSingle();
  if (!row) return Response.json({ error: "This publication does not exist, or you do not have access to it." }, { status: 404 });
  if (row.status === "live") return Response.json({ ok: true });
  try {
    await hosting.promote(row.hosting_project, row.deployment_id);
    const { error } = await asServer.rpc("restore_site_publication", { p_publication: row.id });
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (failure) {
    if (failure instanceof HostingError) return Response.json({ error: failure.message }, { status: 502 });
    logAgentError("Restoring a publication failed", failure);
    return Response.json({ error: "The earlier version could not be restored. Try again." }, { status: 500 });
  }
}
