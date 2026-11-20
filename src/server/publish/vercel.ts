/**
 * The hosting a published client site lives on: Vercel's REST API, called
 * only from the server with the agency's token. A site is static files:
 * each file is uploaded once by its SHA-1, then one production deployment
 * names them all. Every call can be given a fetch, for tests.
 */
import { createHash } from "node:crypto";

const API = "https://api.vercel.com";

export class HostingError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface Deployment {
  id: string;
  url: string;
  projectId: string;
  readyState: string;
}

export interface DomainSetup {
  domain: string;
  /** True when the domain points at the site and has a certificate. */
  ready: boolean;
  /** What to add at the domain's DNS when it is not ready. */
  records: { type: "A" | "CNAME"; name: string; value: string }[];
}

export class Vercel {
  constructor(
    private readonly token: string,
    private readonly teamId?: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private url(path: string, query: Record<string, string> = {}) {
    const params = new URLSearchParams({ ...query, ...(this.teamId ? { teamId: this.teamId } : {}) });
    const qs = params.toString();
    return `${API}${path}${qs ? `?${qs}` : ""}`;
  }

  private async call<T>(method: string, path: string, init: { query?: Record<string, string>; json?: unknown; body?: Uint8Array; headers?: Record<string, string> } = {}): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path, init.query), {
        method,
        headers: { authorization: `Bearer ${this.token}`, ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
        body: init.json !== undefined ? JSON.stringify(init.json) : (init.body as BodyInit | undefined),
      });
    } catch {
      throw new HostingError("The hosting service could not be reached. Try again in a minute.");
    }
    const text = await response.text();
    const data = text ? (JSON.parse(text) as T & { error?: { message?: string } }) : ({} as T & { error?: { message?: string } });
    if (!response.ok) {
      const message = data?.error?.message;
      throw new HostingError(
        response.status === 401 || response.status === 403
          ? "The hosting service refused the server's token. An administrator needs to check VERCEL_TOKEN."
          : `The hosting service answered ${response.status}${message ? `: ${message}` : ""}.`,
        response.status,
      );
    }
    return data;
  }

  /** Uploads one file and returns how a deployment refers to it. */
  async upload(body: Uint8Array): Promise<{ sha: string; size: number }> {
    const sha = createHash("sha1").update(body).digest("hex");
    await this.call("POST", "/v2/files", { body, headers: { "content-type": "application/octet-stream", "x-vercel-digest": sha, "content-length": String(body.byteLength) } });
    return { sha, size: body.byteLength };
  }

  /** A production deployment of uploaded files, in the named project (made on the first deployment). */
  async deploy(project: string, files: { path: string; sha: string; size: number }[]): Promise<Deployment> {
    const data = await this.call<{ id: string; url: string; projectId: string; readyState: string }>("POST", "/v13/deployments", {
      query: { skipAutoDetectionConfirmation: "1" },
      json: { name: project, target: "production", files: files.map((f) => ({ file: f.path, sha: f.sha, size: f.size })), projectSettings: { framework: null } },
    });
    return { id: data.id, url: `https://${data.url}`, projectId: data.projectId, readyState: data.readyState };
  }

  /** Waits until a deployment is ready; refuses one that failed. */
  async waitReady(id: string, timeoutMs = 90_000, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const { readyState } = await this.call<{ readyState: string }>("GET", `/v13/deployments/${encodeURIComponent(id)}`);
      if (readyState === "READY") return;
      if (readyState === "ERROR" || readyState === "CANCELED") throw new HostingError("The hosting service could not publish the site.");
      if (Date.now() > deadline) throw new HostingError("Publishing took too long. Check again in a few minutes.");
      await sleep(1500);
    }
  }

  /** Adds the client's domain to the site's project (once) and says how to point it there. */
  async connectDomain(projectId: string, domain: string): Promise<DomainSetup> {
    try {
      await this.call("POST", `/v10/projects/${encodeURIComponent(projectId)}/domains`, { json: { name: domain } });
    } catch (error) {
      // 400: the domain is already on this project, which is fine. 409: it belongs to another project.
      if (!(error instanceof HostingError) || error.status !== 400) {
        if (error instanceof HostingError && error.status === 409) throw new HostingError(`${domain} is already used by another site on the hosting service.`, 409);
        throw error;
      }
    }
    return this.domainStatus(projectId, domain);
  }

  async domainStatus(projectId: string, domain: string): Promise<DomainSetup> {
    const config = await this.call<{ misconfigured: boolean; recommendedIPv4?: { rank: number; value: string[] | string }[]; recommendedCNAME?: { rank: number; value: string }[] }>(
      "GET",
      `/v6/domains/${encodeURIComponent(domain)}/config`,
      { query: { projectIdOrName: projectId } },
    );
    const best = <T extends { rank: number }>(list: T[] | undefined) => [...(list ?? [])].sort((a, b) => a.rank - b.rank)[0];
    const apex = domain.split(".").length === 2;
    const ip = best(config.recommendedIPv4)?.value;
    const cname = best(config.recommendedCNAME)?.value;
    const records: DomainSetup["records"] = [];
    if (apex && ip) records.push({ type: "A", name: "@", value: Array.isArray(ip) ? ip[0] : ip });
    else if (!apex && cname) records.push({ type: "CNAME", name: domain.split(".")[0], value: cname.replace(/\.$/, "") });
    return { domain, ready: !config.misconfigured, records };
  }

  /**
   * Makes the published site open to everyone. A team's standard protection
   * also puts the project's *.vercel.app production address behind a Vercel
   * login; this keeps the login on preview deployments only, which a client
   * site never has.
   */
  async openToPublic(projectId: string): Promise<void> {
    await this.call("PATCH", `/v9/projects/${encodeURIComponent(projectId)}`, { json: { ssoProtection: { deploymentType: "preview" } } });
  }

  /** The project's lasting production address on the hosting (not one deployment's), or null if it has none yet. */
  async productionAddress(projectId: string): Promise<string | null> {
    const project = await this.call<{ alias?: { domain: string; environment?: string; target?: string }[] }>("GET", `/v9/projects/${encodeURIComponent(projectId)}`);
    const own = (project.alias ?? [])
      .filter((a) => (a.environment === "production" || a.target === "PRODUCTION") && a.domain.endsWith(".vercel.app"))
      .map((a) => a.domain)
      .sort((a, b) => a.length - b.length)[0];
    return own ? `https://${own}` : null;
  }

  /** Points the site's production traffic back at an earlier deployment (no rebuild). */
  async promote(projectId: string, deploymentId: string): Promise<void> {
    await this.call("POST", `/v10/projects/${encodeURIComponent(projectId)}/promote/${encodeURIComponent(deploymentId)}`);
  }
}

/** A project name the hosting accepts: lower-case letters, digits and hyphens, at most 100. */
export function hostingProjectName(clientName: string, projectId: string): string {
  const slug = clientName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return `site-${slug || "client"}-${projectId.replace(/-/g, "").slice(0, 8)}`;
}

/** A domain as people type it, cleaned; null when it is not a domain. */
export function cleanDomain(raw: string): string | null {
  const domain = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain) && domain.length <= 253 ? domain : null;
}
