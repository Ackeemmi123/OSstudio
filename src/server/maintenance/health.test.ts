import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const respond = (map: Record<string, { status: number; location?: string } | "down">) =>
  (async (url: string) => {
    const found = map[url];
    if (!found || found === "down") throw new Error("down");
    return new Response(null, { status: found.status, headers: found.location ? { location: found.location } : {} });
  }) as unknown as typeof fetch;

describe("the health check", () => {
  it("passes a site that answers, with a valid certificate and www leading to it", async () => {
    const { checkSite } = await import("./health");
    const health = await checkSite({ url: "https://bageri.fi", domain: "bageri.fi" }, { fetch: respond({ "https://bageri.fi": { status: 200 }, "https://www.bageri.fi/": { status: 308, location: "https://bageri.fi/" } }), certDays: async () => 80 });
    expect(health).toMatchObject({ ok: true, problems: [], status: 200, certDaysLeft: 80, wwwOk: true });
  });

  it("names each problem in plain words", async () => {
    const { checkSite } = await import("./health");
    const health = await checkSite({ url: "https://bageri.fi", domain: "bageri.fi" }, { fetch: respond({ "https://bageri.fi": { status: 503 }, "https://www.bageri.fi/": "down" }), certDays: async () => 5 });
    expect(health.ok).toBe(false);
    expect(health.problems).toEqual(["https://bageri.fi answers with error 503.", "The certificate for bageri.fi runs out in 5 days.", "www.bageri.fi does not lead to the site."]);
  });

  it("checks only the address for a site without its own domain", async () => {
    const { checkSite } = await import("./health");
    const health = await checkSite({ url: "https://x.vercel.app", domain: null }, { fetch: respond({ "https://x.vercel.app": { status: 200 } }) });
    expect(health).toMatchObject({ ok: true, certDaysLeft: null, wwwOk: null });
  });
});
