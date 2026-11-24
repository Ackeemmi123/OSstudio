import { describe, expect, it } from "vitest";
import { daysSince, deliveryOf, type DeliveryBuildFacts, type DeliveryFacts } from "./delivery";

const NOW = Date.parse("2026-11-24T10:00:00Z");
const facts = (over: Partial<DeliveryFacts> = {}): DeliveryFacts => ({ projectId: "p", clientId: "c", spec: null, builds: [], live: null, ...over });
const approvedSpec = { id: "s", version: 1, status: "approved" as const, approvedAt: "2026-11-23T12:00:00Z", updatedAt: "2026-11-23T12:00:00Z" };
const build = (over: Partial<DeliveryBuildFacts> = {}): DeliveryBuildFacts => ({
  specVersion: 1,
  createdAt: "2026-11-23T14:46:00Z",
  expiresAt: "2026-12-23T14:46:00Z",
  revokedAt: null,
  link: "/s/tok/",
  approval: null,
  openComments: 0,
  ...over,
});

describe("where a website stands", () => {
  it("asks for a spec when none was started", () => {
    expect(deliveryOf(facts(), NOW)).toMatchObject({ stage: "spec", step: 0, next: "Start the website spec" });
  });

  it("asks to finish a draft, and to review one that was submitted", () => {
    expect(deliveryOf(facts({ spec: { ...approvedSpec, status: "draft", approvedAt: null } }), NOW)).toMatchObject({ stage: "spec", next: "Finish spec v1 and submit it" });
    expect(deliveryOf(facts({ spec: { ...approvedSpec, status: "in_review", approvedAt: null } }), NOW)).toMatchObject({ stage: "review", step: 0 });
  });

  it("asks to build once the spec is approved", () => {
    expect(deliveryOf(facts({ spec: approvedSpec }), NOW)).toMatchObject({ stage: "approved", step: 1, next: "Build the site and send the review link" });
  });

  it("ignores a build made before the approval, as publishing does", () => {
    const early = build({ createdAt: "2026-11-17T14:00:00Z", approval: { name: "Natalie", at: "2026-11-18T09:00:00Z" } });
    expect(deliveryOf(facts({ spec: approvedSpec, builds: [early] }), NOW).stage).toBe("approved");
  });

  it("waits on the client while the review link is open, and gives the link", () => {
    const delivery = deliveryOf(facts({ spec: approvedSpec, builds: [build()] }), NOW);
    expect(delivery).toMatchObject({ stage: "built", step: 2, next: "Waiting for the client's approval", reviewLink: "/s/tok/", waitingOnClient: true });
  });

  it("puts open comments first: the next move is the studio's", () => {
    const delivery = deliveryOf(facts({ spec: approvedSpec, builds: [build({ openComments: 2 })] }), NOW);
    expect(delivery).toMatchObject({ stage: "built", waitingOnClient: false, openComments: 2, detail: "2 comments to answer on the review link." });
  });

  it("asks to build again when the only link was turned off or expired", () => {
    const off = build({ revokedAt: "2026-11-24T08:00:00Z" });
    const old = build({ expiresAt: "2026-11-24T09:00:00Z" });
    expect(deliveryOf(facts({ spec: approvedSpec, builds: [off, old] }), NOW)).toMatchObject({ stage: "approved", detail: "The last review link was turned off or has expired." });
  });

  it("asks to publish once the client approved on the link", () => {
    const delivery = deliveryOf(facts({ spec: approvedSpec, builds: [build({ approval: { name: "Natalie", at: "2026-11-24T09:00:00Z" } })] }), NOW);
    expect(delivery).toMatchObject({ stage: "clientApproved", step: 3, next: "Publish it on the client's domain", since: "2026-11-24T09:00:00Z" });
  });

  it("is live when this version is published, and remembers the live site while a newer one is drafted", () => {
    const live = { specVersion: 1, url: "https://forening.fi", domain: "forening.fi", at: "2026-11-25T10:00:00Z" };
    expect(deliveryOf(facts({ spec: approvedSpec, live }), NOW)).toMatchObject({ stage: "live", step: 4, next: "Live on forening.fi" });
    const next = deliveryOf(facts({ spec: { ...approvedSpec, version: 2, status: "draft", approvedAt: null }, live }), NOW);
    expect(next).toMatchObject({ stage: "spec", liveUrl: "https://forening.fi", detail: "The site is live; this is the next version." });
  });

  it("counts whole days", () => {
    expect(daysSince("2026-11-21T09:00:00Z", NOW)).toBe(3);
    expect(daysSince(null, NOW)).toBeNull();
  });
});
