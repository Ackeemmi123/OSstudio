import { describe, expect, it } from "vitest";
import { setContextField } from "@/lib/domain/clients";
import { testDeps } from "@/lib/domain/test-helpers";
import { briefClient, completeSpec } from "./test-helpers";
import { approvalBlockers, contrastRatio } from "./validate";

function messages(...args: Parameters<typeof approvalBlockers>): string[] {
  return approvalBlockers(...args).map((b) => b.message);
}

describe("approval blockers", () => {
  it("has none for a complete spec built from a confirmed brief", () => {
    const client = briefClient();
    expect(messages(completeSpec(client), client)).toEqual([]);
  });

  it("refuses brief values that are not confirmed", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    const unconfirmed = setContextField(client, "goal", { value: "More cake pre-orders from local customers", confidence: "observed" }, testDeps()).client;
    expect(messages(spec, unconfirmed)).toContainEqual(expect.stringMatching(/Goal is used from the brief but is not confirmed/));
  });

  it("refuses brief values that were confirmed again with another value since", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    const later = { ...testDeps(), now: () => "2026-10-27T09:00:00.000Z" };
    const changed = setContextField(client, "goal", { value: "Catering orders", confidence: "confirmed" }, later).client;
    expect(messages(spec, changed)).toContainEqual(expect.stringMatching(/Goal changed in the brief/));
  });

  it("refuses a suggestion nobody accepted", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    spec.pages[0].sections[0].source = { kind: "proposal", runId: "run-1", proposalId: "p-1" };
    expect(messages(spec, client)).toContainEqual(expect.stringMatching(/nobody has accepted/));
    spec.pages[0].sections[0].source = { kind: "proposal", runId: "run-1", proposalId: "p-1", acceptedBy: "Alex" };
    expect(messages(spec, client)).toEqual([]);
  });

  it("needs the brand chosen by a person, with enough contrast", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    delete spec.brand.source;
    spec.brand.colors.text = "#BBBBBB";
    spec.brand.colors.primary = "#EEEEEE";
    const found = messages(spec, client);
    expect(found).toContainEqual(expect.stringMatching(/Choose the brand/));
    expect(found).toContainEqual(expect.stringMatching(/Text on the background/));
    expect(found).toContainEqual(expect.stringMatching(/primary colour/));
  });

  it("needs every text in every language of the website", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    spec.locales.available = ["en", "fi"];
    const found = messages(spec, client);
    expect(found).toContainEqual("Home: the page title is missing in Finnish.");
    expect(found).toContainEqual("Contact: the address is missing in Finnish.");
    expect(found).toContainEqual("The site name is missing in Finnish.");
  });

  it("does not ask for search texts on pages hidden from search", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    spec.pages[1].seo = { title: {}, description: {}, noindex: true };
    expect(messages(spec, client)).toEqual([]);
  });

  it("refuses placeholder images and images without alternative text", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    spec.assets.push({ id: "hero-photo", kind: "photo", alt: {}, origin: "placeholder", description: "Cake on the counter" });
    const found = messages(spec, client);
    expect(found).toContainEqual(expect.stringMatching(/Cake on the counter: still a placeholder/));
    expect(found).toContainEqual(expect.stringMatching(/Cake on the counter: the alternative text is missing/));
  });

  it("accepts an image only when it is an approved image of the same client", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    const fileId = "5b2d8c41-0e3f-4a5b-9c6d-7e8f9a0b1c2d";
    spec.assets.push({ id: "hero-photo", kind: "photo", alt: { en: "Cake" }, origin: "client_supplied", description: "Cake", fileId });
    const message = (status: "approved" | "pending_review" | "rejected" | "deleted", clientId = client.id) =>
      messages(spec, client, [{ id: fileId, clientId, status }]).join(" ");
    expect(message("approved")).toBe("");
    expect(message("pending_review")).toMatch(/rights for this image are not approved yet/);
    expect(message("rejected")).toMatch(/rights for this image were rejected/);
    expect(message("deleted")).toMatch(/image was deleted/);
    expect(message("approved", "another-client")).toMatch(/not available for this client/);
    expect(messages(spec, client).join(" ")).toMatch(/not available for this client/);
    delete spec.assets[0].fileId;
    expect(messages(spec, client).join(" ")).toMatch(/has no image file/);
  });

  it("needs content in sections that list things", () => {
    const client = briefClient();
    const spec = completeSpec(client);
    spec.pages[0].sections.push({ id: "services", kind: "services", variant: "cards", heading: {}, items: [] });
    expect(messages(spec, client)).toContainEqual(expect.stringMatching(/Home › Services: add at least one item/));
  });
});

describe("contrast", () => {
  it("matches the WCAG formula", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#FFFFFF", "#777777")).toBeCloseTo(contrastRatio("#777777", "#FFFFFF"), 10);
  });
});
