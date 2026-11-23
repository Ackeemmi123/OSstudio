/** The competitor comparison on the server: which addresses may be read, and a whole run with invented sites. */
import { describe, expect, it, vi } from "vitest";
import { benchmarkResultOf } from "@/lib/agents/contract";
import { buildNewClient } from "@/lib/domain/clients";
import { testDeps } from "@/lib/domain/test-helpers";
import { MemoryStore, NOW } from "@/server/agents/testing/memory-store";
import { fetchPublicPage, isPrivateAddress, PageError, publicUrl } from "./fetch-page";
import { runBenchmark, type BenchmarkStore, type BenchmarkTools } from "./runner";

vi.mock("server-only", () => ({}));

describe("which addresses may be read", () => {
  it("accepts public web addresses, adding https when none is typed", () => {
    expect(publicUrl("kafe-example.fi").toString()).toBe("https://kafe-example.fi/");
    expect(publicUrl("http://www.example.com/meny#top").toString()).toBe("http://www.example.com/meny");
  });

  it("refuses this machine, private networks, other ports and other schemes", () => {
    for (const bad of ["http://localhost/", "http://127.0.0.1/", "http://10.0.0.8/", "http://169.254.169.254/latest/meta-data", "http://192.168.1.1/", "http://[::1]/", "https://example.com:8080/", "ftp://example.com/", "file:///etc/passwd", "https://user:pw@example.com/", "http://printer.local/", "intranet"]) {
      expect(() => publicUrl(bad), bad).toThrow(PageError);
    }
  });

  it("knows private and public addresses", () => {
    expect(["10.1.2.3", "172.20.0.1", "100.64.0.1", "::ffff:127.0.0.1", "fd00::1", "fe80::1"].every(isPrivateAddress)).toBe(true);
    expect(["93.184.216.34", "2606:4700::1111"].some(isPrivateAddress)).toBe(false);
  });

  it("checks every redirect and stops at a private one", async () => {
    const fake = vi.fn(async (url: URL | string) =>
      String(url).startsWith("https://93.184.216.34/") ? new Response(null, { status: 301, headers: { location: "http://127.0.0.1/admin" } }) : new Response("<p>secret</p>", { headers: { "content-type": "text/html" } }),
    );
    await expect(fetchPublicPage("https://93.184.216.34/", fake as unknown as typeof fetch)).rejects.toThrow("public");
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("sends back a cookie the site set while redirecting, to the same host only", async () => {
    const seen: (string | null)[] = [];
    const fake = async (url: URL | string, init?: RequestInit) => {
      const cookie = new Headers(init?.headers).get("cookie");
      seen.push(cookie);
      if (!cookie) return new Response(null, { status: 302, headers: { location: "/en/", "set-cookie": "selectedLang=en; Path=/; Max-Age=60" } });
      return new Response("<h1>Hello</h1>", { headers: { "content-type": "text/html" } });
    };
    expect((await fetchPublicPage("https://93.184.216.34/", fake as unknown as typeof fetch)).html).toBe("<h1>Hello</h1>");
    expect(seen).toEqual([null, "selectedLang=en"]);
  });

  it("reads HTML only", async () => {
    const fake = async () => new Response("%PDF", { headers: { "content-type": "application/pdf" } });
    await expect(fetchPublicPage("https://93.184.216.34/", fake as unknown as typeof fetch)).rejects.toThrow("not a web page");
  });
});

const OURS = `<html lang="sv"><head><meta name="viewport" content="width=device-width"><meta name="description" content="Soppa, bröd och kaffe vid torget i Ekenäs, varje dag."></head>
<body><h1>Soppa och bröd vid torget</h1><a href="tel:+358400000000">Ring</a><p>Torget 3, 10600 Ekenäs</p><p>Öppet måndag–fredag 8–16</p><form></form></body></html>`;
const THEIRS = `<html><head></head><body><h1>Välkommen</h1><p>Vi brinner för kaffe. Lunch 11 €.</p></body></html>`;

class Store extends MemoryStore implements BenchmarkStore {
  site: { url: string; published: boolean } | null = { url: "/s/secret-token-0123456789abcdef0123/", published: false };
  async loadProject(projectId: string) {
    return projectId === "project-1" ? { clientId: this.client!.id } : null;
  }
  async ourSite() {
    return this.site;
  }
}

function setup() {
  const client = buildNewClient({ name: "Kafé Testgränd (TEST)", sourceType: "email" }, testDeps()).client;
  return new Store(client, [], { id: "qa", taskType: "qa.benchmark" });
}

const tools = (speedCalls: string[] = []): BenchmarkTools => ({
  checkUrl: (url) => publicUrl(url).toString(),
  fetchPage: async (url) => {
    if (url.includes("down.example")) throw new PageError("The page did not answer in time.");
    return { url, html: url.includes("/s/") ? OURS : THEIRS };
  },
  measureSpeed: async (url) => {
    speedCalls.push(url);
    return { speed: { performance: 40, accessibility: 80, seo: 70, lcpSeconds: 6.1 }, note: null };
  },
});

const run = (store: Store, overrides: Partial<Parameters<typeof runBenchmark>[0]> = {}) =>
  runBenchmark({ store, tools: tools(), clientId: store.client!.id, projectId: "project-1", competitors: ["konkurrent.example"], origin: "https://studio.example", requestedBy: "user-1", now: () => NOW, ...overrides });

describe("runBenchmark", () => {
  it("compares the review link with competitors, never sending the private link to Google", async () => {
    const store = setup();
    const speedCalls: string[] = [];
    const outcome = await run(store, { tools: tools(speedCalls), competitors: ["konkurrent.example", "https://www.konkurrent.example/", "down.example"] });
    const result = benchmarkResultOf(outcome.body.run)!;
    expect(outcome.body.run).toMatchObject({ agentId: "qa", taskType: "qa.benchmark", status: "succeeded", runner: "benchmark", model: null });
    expect(speedCalls).toEqual(["https://konkurrent.example/", "https://down.example/"]);
    expect(result.competitors.map((c) => c.url)).toEqual(["https://konkurrent.example/", "https://down.example/"]);
    expect(result.ours).toMatchObject({ url: "review link", published: false, speed: null, speedNote: expect.stringContaining("after publishing") });
    expect(JSON.stringify(result)).not.toContain("secret-token");
    expect(result.competitors[1]).toMatchObject({ page: null, error: "The page did not answer in time." });
    const standing = Object.fromEntries(result.comparison.rows.map((r) => [r.key, r.standing]));
    expect(standing).toMatchObject({ phone: "ahead", hours: "ahead", prices: "behind", plain: "ahead", speed: "unknown" });
    expect(result.comparison.fixes.map((f) => f.key)).toEqual(["prices"]);
    expect(store.events).toEqual(["agent.run_started", "agent.run_completed"]);
  });

  it("measures a published site's speed too", async () => {
    const store = setup();
    store.site = { url: "https://kafetestgrand.example/", published: true };
    const speedCalls: string[] = [];
    await run(store, { tools: { ...tools(speedCalls), fetchPage: async (url) => ({ url, html: url.includes("kafetestgrand") ? OURS : THEIRS }) } });
    expect(speedCalls).toContain("https://kafetestgrand.example/");
  });

  it("refuses private addresses, too many competitors, and a project with no site yet", async () => {
    expect((await run(setup(), { competitors: ["http://192.168.0.1/"] })).status).toBe(400);
    expect((await run(setup(), { competitors: ["a.example", "b.example", "c.example", "d.example"] })).status).toBe(400);
    const empty = setup();
    empty.site = null;
    expect((await run(empty)).status).toBe(409);
    expect((await run(setup(), { projectId: "project-2" })).status).toBe(404);
  });
});
