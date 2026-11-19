import { logAgentError } from "@/server/agents/agent-request";
import { isUuid, publishAccess } from "@/server/publish/access";
import { publishSite, type PublishContext } from "@/server/publish/publish";
import { buildSite } from "@/server/site-builds/build";
import { buildDeps } from "@/server/site-builds/deps";

// Builds, uploads and waits for the hosting: a few minutes at most.
export const maxDuration = 300;

/**
 * Publishes an approved spec version, which the client approved on its review
 * link, to the hosting and (optionally) the client's domain.
 * application/json: studioId, specId, domain?.
 */
export async function POST(request: Request) {
  const access = await publishAccess(request);
  if (!access.ok) return access.response;
  const { body, studioId, asUser, asServer, hosting, actor } = access;
  if (!isUuid(body.specId)) return Response.json({ error: "The request was not understood." }, { status: 400 });
  const domain = typeof body.domain === "string" ? body.domain : undefined;

  const load = async (specId: string): Promise<PublishContext | null> => {
    const { data: record } = await asUser.from("site_specs").select("id, client_id, project_id, version, status, spec").eq("id", specId).eq("studio_id", studioId).maybeSingle();
    if (!record) return null;
    const [{ data: client }, { data: builds }, { data: earlier }] = await Promise.all([
      asUser.from("clients").select("name, email").eq("id", record.client_id).maybeSingle(),
      asUser.from("site_builds").select("id, created_at, site_approvals(id)").eq("spec_id", record.id).eq("spec_version", record.version).order("created_at", { ascending: false }),
      asUser.from("site_publications").select("form_key").eq("project_id", record.project_id).order("created_at", { ascending: false }).limit(1),
    ]);
    const approved = (builds ?? []).find((b) => ([] as unknown[]).concat((b.site_approvals as unknown) ?? []).length > 0);
    const spec = record.spec as { forms?: unknown[]; seo?: { siteName?: Record<string, string> } };
    return {
      spec: { id: record.id, version: record.version, status: record.status, spec: record.spec, clientId: record.client_id, projectId: record.project_id, hasForms: (spec.forms?.length ?? 0) > 0 },
      client: { name: String(client?.name ?? "client"), email: (client?.email as string | null) ?? null },
      approvedBuildId: approved?.id ?? null,
      formKey: (earlier?.[0]?.form_key as string | undefined) ?? null,
      siteName: Object.values(spec.seo?.siteName ?? {}).find(Boolean) ?? String(client?.name ?? "Website"),
    };
  };

  try {
    const outcome = await publishSite(
      { specId: body.specId, domain, origin: new URL(request.url).origin, actor, studioId },
      {
        load,
        build: (context, formAction) => buildSite({ studioId, specVersion: context.spec.version, spec: context.spec.spec, production: { formAction } }, buildDeps(asUser, asServer, studioId, context.spec.clientId)),
        hosting,
        record: async (publication) => {
          const { error } = await asServer.rpc("record_site_publication", { p_publication: publication });
          if (error) throw error;
        },
      },
    );
    if (!outcome.ok) return Response.json({ error: outcome.error, reasons: outcome.reasons ?? [] }, { status: outcome.status });
    return Response.json(outcome, { status: 201 });
  } catch (failure) {
    logAgentError("Publishing failed", failure);
    return Response.json({ error: "The site could not be published. Try again." }, { status: 500 });
  }
}
