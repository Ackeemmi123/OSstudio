/** Publishing a client site, with the hosting, storage and build faked. Every client is invented. */
import { describe, expect, it } from "vitest";
import { publishBlockers, publishSite, type PublishContext, type PublishDeps } from "./publish";
import { cleanDomain, hostingProjectName, HostingError } from "./vercel";

const ACTOR = { kind: "human" as const, name: "Owner", userId: "u1" };
const READY: PublishContext = {
  spec: { id: "spec-1", version: 3, status: "approved", spec: {}, clientId: "c1", projectId: "0b5344dc-7612-44c9-8616-1cce0ba262e6", hasForms: true },
  client: { name: "Förvaltningssällskapet (test)", email: "kontakt@example.test" },
  approvedBuildId: "build-1",
  formKey: null,
  siteName: "Testsällskapet",
};

function deps(context: PublishContext | null = READY, hostingFails = false) {
  const calls: Record<string, unknown[]> = { upload: [], deploy: [], record: [], build: [], domain: [], open: [] };
  const d: PublishDeps = {
    load: async () => context,
    build: async (_c, formAction) => (calls.build.push(formAction), { id: "x", shareToken: "t", storagePrefix: "p", designSystem: "association@0.1", checks: [], expiresAt: new Date(), files: [{ path: "index.html", body: new TextEncoder().encode("<h1>Hej</h1>"), contentType: "text/html" }, { path: "404.html", body: new TextEncoder().encode("404"), contentType: "text/html" }] }),
    hosting: {
      upload: async (body) => (calls.upload.push(body.byteLength), { sha: `sha${body.byteLength}`, size: body.byteLength }),
      deploy: async (project, files) => {
        if (hostingFails) throw new HostingError("The hosting service answered 500.", 500);
        calls.deploy.push({ project, files });
        return { id: "dpl_1", url: "https://site-x.vercel.app", projectId: "prj_1", readyState: "READY" };
      },
      waitReady: async () => undefined,
      openToPublic: async (projectId) => void calls.open.push(projectId),
      productionAddress: async () => "https://site-x-axivo3.vercel.app",
      connectDomain: async (projectId, domain) => (calls.domain.push({ projectId, domain }), { domain, ready: false, records: [{ type: "A" as const, name: "@", value: "203.0.113.1" }] }),
    },
    record: async (row) => void calls.record.push(row),
  };
  return { d, calls };
}

describe("publishing", () => {
  it("lists what is missing before anything is built", async () => {
    const context = { ...READY, spec: { ...READY.spec, status: "draft" }, approvedBuildId: null, client: { ...READY.client, email: null } };
    expect(publishBlockers(context)).toHaveLength(3);
    const { d, calls } = deps(context);
    const outcome = await publishSite({ specId: "spec-1", origin: "https://studio.example", actor: ACTOR, studioId: "s1" }, d);
    expect(outcome).toMatchObject({ ok: false, status: 409 });
    expect(calls.build).toEqual([]);
  });

  it("builds with a form address, uploads every file, deploys and records the publication", async () => {
    const { d, calls } = deps();
    const outcome = await publishSite({ specId: "spec-1", domain: "https://Forening.FI/", origin: "https://studio.example", actor: ACTOR, studioId: "s1" }, d);
    expect(outcome).toMatchObject({ ok: true, url: "https://forening.fi", domain: { ready: false } });
    expect(String(calls.build[0])).toMatch(/^https:\/\/studio\.example\/api\/site-forms\/[A-Za-z0-9_-]{32}$/);
    expect(calls.upload).toHaveLength(3);
    expect(calls.deploy[0]).toMatchObject({ project: "site-forvaltningssallskapet-test-0b5344dc", files: [{ path: "index.html" }, { path: "404.html" }, { path: "vercel.json" }] });
    expect(calls.domain).toEqual([{ projectId: "prj_1", domain: "forening.fi" }]);
    expect(calls.record[0]).toMatchObject({ spec_version: 3, approved_build_id: "build-1", hosting_project: "prj_1", deployment_id: "dpl_1", domain: "forening.fi", form_recipient: "kontakt@example.test" });
  });

  it("keeps the form address of earlier publications", async () => {
    const { d, calls } = deps({ ...READY, formKey: "k".repeat(32) });
    await publishSite({ specId: "spec-1", origin: "https://studio.example", actor: ACTOR, studioId: "s1" }, d);
    expect(calls.build[0]).toBe(`https://studio.example/api/site-forms/${"k".repeat(32)}`);
    expect(calls.record[0]).toMatchObject({ form_key: "k".repeat(32), domain: "", deployment_url: "https://site-x-axivo3.vercel.app" });
    expect(calls.open).toEqual(["prj_1"]);
  });

  it("refuses a domain that is not one, and reports a hosting failure without recording", async () => {
    expect(await publishSite({ specId: "spec-1", domain: "not a domain", origin: "https://s", actor: ACTOR, studioId: "s1" }, deps().d)).toMatchObject({ ok: false, status: 400 });
    const { d, calls } = deps(READY, true);
    expect(await publishSite({ specId: "spec-1", origin: "https://s", actor: ACTOR, studioId: "s1" }, d)).toMatchObject({ ok: false, status: 502 });
    expect(calls.record).toEqual([]);
  });

  it("names hosting projects and cleans domains", () => {
    expect(hostingProjectName("Nomad Interior!", "6fdbe280-57c1-4f7d-a0ef-7ef8528bd24b")).toBe("site-nomad-interior-6fdbe280");
    expect(cleanDomain("www.Forening.fi")).toBe("www.forening.fi");
    expect(cleanDomain("forening")).toBeNull();
  });
});
