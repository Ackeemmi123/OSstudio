/** The hosting calls, against a fake fetch: what is sent and how answers are read. */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HostingError, Vercel } from "./vercel";

function fake(answers: { status: number; body?: unknown }[]) {
  const sent: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    const answer = answers.shift() ?? { status: 200, body: {} };
    return new Response(answer.body === undefined ? "" : JSON.stringify(answer.body), { status: answer.status });
  }) as unknown as typeof fetch;
  return { sent, fetchImpl };
}

describe("Vercel", () => {
  it("uploads a file by its SHA-1 with the team", async () => {
    const { sent, fetchImpl } = fake([{ status: 200 }]);
    const body = new TextEncoder().encode("<h1>Hej</h1>");
    const ref = await new Vercel("tok", "team_1", fetchImpl).upload(body);
    expect(ref).toEqual({ sha: createHash("sha1").update(body).digest("hex"), size: body.byteLength });
    expect(sent[0].url).toBe("https://api.vercel.com/v2/files?teamId=team_1");
    expect(sent[0].init.headers).toMatchObject({ authorization: "Bearer tok", "x-vercel-digest": ref.sha, "content-length": String(body.byteLength) });
  });

  it("deploys static files to production", async () => {
    const { sent, fetchImpl } = fake([{ status: 200, body: { id: "dpl_1", url: "site-x.vercel.app", projectId: "prj_1", readyState: "QUEUED" } }]);
    const d = await new Vercel("tok", undefined, fetchImpl).deploy("site-x", [{ path: "index.html", sha: "abc", size: 3 }]);
    expect(d).toEqual({ id: "dpl_1", url: "https://site-x.vercel.app", projectId: "prj_1", readyState: "QUEUED" });
    expect(sent[0].url).toBe("https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1");
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ name: "site-x", target: "production", files: [{ file: "index.html", sha: "abc", size: 3 }], projectSettings: { framework: null } });
  });

  it("waits for a deployment and refuses one that failed", async () => {
    const v = new Vercel("tok", undefined, fake([{ status: 200, body: { readyState: "BUILDING" } }, { status: 200, body: { readyState: "READY" } }]).fetchImpl);
    await expect(v.waitReady("dpl_1", 10_000, async () => undefined)).resolves.toBeUndefined();
    const bad = new Vercel("tok", undefined, fake([{ status: 200, body: { readyState: "ERROR" } }]).fetchImpl);
    await expect(bad.waitReady("dpl_1", 10_000, async () => undefined)).rejects.toThrow(HostingError);
  });

  it("connects a domain once, and says what DNS records it needs", async () => {
    const apex = fake([{ status: 400, body: { error: { message: "exists" } } }, { status: 200, body: { misconfigured: true, recommendedIPv4: [{ rank: 2, value: ["198.51.100.2"] }, { rank: 1, value: ["203.0.113.1"] }], recommendedCNAME: [] } }]);
    expect(await new Vercel("tok", undefined, apex.fetchImpl).connectDomain("prj_1", "forening.fi")).toEqual({ domain: "forening.fi", ready: false, records: [{ type: "A", name: "@", value: "203.0.113.1" }] });
    const sub = fake([{ status: 200, body: { verified: true } }, { status: 200, body: { misconfigured: false, recommendedIPv4: [], recommendedCNAME: [{ rank: 1, value: "cname.example.net." }] } }]);
    expect(await new Vercel("tok", undefined, sub.fetchImpl).connectDomain("prj_1", "www.forening.fi")).toEqual({ domain: "www.forening.fi", ready: true, records: [{ type: "CNAME", name: "www", value: "cname.example.net" }] });
    const taken = fake([{ status: 409, body: {} }]);
    await expect(new Vercel("tok", undefined, taken.fetchImpl).connectDomain("prj_1", "forening.fi")).rejects.toThrow(/already used by another site/);
  });

  it("explains a refused token", async () => {
    await expect(new Vercel("bad", undefined, fake([{ status: 403, body: {} }]).fetchImpl).promote("prj_1", "dpl_1")).rejects.toThrow(/VERCEL_TOKEN/);
  });
});
