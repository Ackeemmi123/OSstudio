/**
 * Publishing a client site: the checks that must pass, the real build, the
 * upload to the hosting, the client's domain, and the record. Storage and
 * hosting come in as deps so the order and the refusals can be tested.
 */
import { randomBytes, randomUUID } from "node:crypto";
import type { BuiltSite } from "@/server/site-builds/build";
import { cleanDomain, hostingProjectName, HostingError, type DomainSetup, type Vercel } from "./vercel";

export interface PublishContext {
  spec: { id: string; version: number; status: string; spec: unknown; clientId: string; projectId: string; hasForms: boolean };
  client: { name: string; email: string | null };
  /** The newest build the client approved on its review link, made after the spec was approved (so it shows exactly what is published). */
  approvedBuildId: string | null;
  /** Who approved that build on the link, and when (YYYY-MM-DD). */
  approval?: { name: string; on: string } | null;
  /** The form key of the project's earlier publications, so form addresses stay the same. */
  formKey: string | null;
  siteName: string;
}

export interface PublishDeps {
  load: (specId: string) => Promise<PublishContext | null>;
  build: (context: PublishContext, formAction: string) => Promise<BuiltSite>;
  hosting: Pick<Vercel, "upload" | "deploy" | "waitReady" | "connectDomain" | "openToPublic" | "productionAddress">;
  record: (publication: Record<string, unknown>) => Promise<void>;
}

export type PublishOutcome =
  | { ok: true; publicationId: string; url: string; domain: DomainSetup | null }
  | { ok: false; status: number; error: string; reasons?: string[] };

/** Why a version cannot be published yet; empty when it can. */
export function publishBlockers(context: PublishContext): string[] {
  const reasons: string[] = [];
  if (context.spec.status !== "approved") reasons.push("Approve this version of the spec in Studio OS first.");
  if (!context.approvedBuildId) reasons.push("The client has not approved this version on its review link. Build the site after approving the spec, and have the client approve that link.");
  if (context.spec.hasForms && !context.client.email) reasons.push("The site has a form, but the client has no contact e-mail to send it to.");
  return reasons;
}

async function inBatches<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(work))));
  return out;
}

export async function publishSite(
  input: { specId: string; domain?: string; origin: string; actor: { kind: "human"; name: string; userId: string }; studioId: string },
  deps: PublishDeps,
): Promise<PublishOutcome> {
  const domain = input.domain?.trim() ? cleanDomain(input.domain) : null;
  if (input.domain?.trim() && !domain) return { ok: false, status: 400, error: "That is not a domain. Write it like forening.fi." };
  const context = await deps.load(input.specId);
  if (!context) return { ok: false, status: 404, error: "This spec does not exist, or you do not have access to it." };
  const reasons = publishBlockers(context);
  if (reasons.length) return { ok: false, status: 409, error: "The site cannot be published yet.", reasons };

  const formKey = context.formKey ?? randomBytes(24).toString("base64url");
  let site: BuiltSite;
  try {
    site = await deps.build(context, `${input.origin.replace(/\/$/, "")}/api/site-forms/${formKey}`);
  } catch (error) {
    const checks = (error as { checks?: { level: string; message: string }[] }).checks ?? [];
    return { ok: false, status: 422, error: error instanceof Error ? error.message : "The site was not built.", reasons: checks.filter((c) => c.level === "error").map((c) => c.message) };
  }

  try {
    // Folder addresses always end in a slash, so the pages' relative links resolve the same however a visitor types them.
    const hosted = [...site.files.filter((file) => file.path !== "vercel.json"), { path: "vercel.json", body: new TextEncoder().encode(JSON.stringify({ trailingSlash: true })) }];
    const files = await inBatches(hosted, 6, async (file) => ({ path: file.path, ...(await deps.hosting.upload(file.body)) }));
    const deployment = await deps.hosting.deploy(hostingProjectName(context.client.name, context.spec.projectId), files);
    await deps.hosting.waitReady(deployment.id);
    await deps.hosting.openToPublic(deployment.projectId);
    const address = (await deps.hosting.productionAddress(deployment.projectId)) ?? deployment.url;
    const setup = domain ? await deps.hosting.connectDomain(deployment.projectId, domain) : null;
    const id = randomUUID();
    await deps.record({
      id,
      studio_id: input.studioId,
      client_id: context.spec.clientId,
      project_id: context.spec.projectId,
      spec_id: context.spec.id,
      spec_version: context.spec.version,
      approved_build_id: context.approvedBuildId,
      hosting_project: deployment.projectId,
      deployment_id: deployment.id,
      deployment_url: address,
      domain: domain ?? "",
      form_key: formKey,
      form_recipient: context.client.email ?? "",
      site_name: context.siteName.slice(0, 120),
      published_by: input.actor,
    });
    return { ok: true, publicationId: id, url: domain ? `https://${domain}` : address, domain: setup };
  } catch (error) {
    if (error instanceof HostingError) return { ok: false, status: 502, error: error.message };
    throw error;
  }
}
