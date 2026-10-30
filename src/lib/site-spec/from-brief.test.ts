import { describe, expect, it } from "vitest";
import { startingSpec } from "./from-brief";
import { briefClient } from "./test-helpers";
import { approvalBlockers, parseSiteSpec } from "./validate";

describe("the starting spec", () => {
  it("copies confirmed brief values with their source", () => {
    const client = briefClient();
    const { spec, unconfirmed } = startingSpec(client, { projectType: "website" });
    expect(unconfirmed).toEqual([]);
    expect(spec.strategy.goal).toEqual({
      text: "More cake pre-orders from local customers",
      source: { kind: "brief", field: "goal", confirmedAt: client.context.goal.confirmedAt },
    });
    expect(spec.strategy.audiences[0]).toMatchObject({ text: "Families ordering birthday cakes", source: { kind: "brief", field: "targetAudience" } });
    expect(spec.pages[0].sections[1]).toMatchObject({ kind: "text", body: { en: "Celebration cakes, sourdough bread and catering" }, source: { field: "offering" } });
  });

  it("leaves out values that are not confirmed, and lists them", () => {
    const client = briefClient(["targetAudience"]);
    const { spec, unconfirmed } = startingSpec(client, { projectType: "website" });
    expect(unconfirmed).toEqual(["goal", "offering"]);
    expect(spec.strategy.goal).toEqual({ text: "" });
    expect(JSON.stringify(spec)).not.toContain("cake pre-orders");
    expect(JSON.stringify(spec)).not.toContain("€3,000");
  });

  it("is a valid draft that cannot be approved as it is", () => {
    const client = briefClient();
    const { spec } = startingSpec(client, { projectType: "website" });
    expect(parseSiteSpec(spec).ok).toBe(true);
    expect(approvalBlockers(spec, client).map((b) => b.message)).toContainEqual(expect.stringMatching(/Choose the brand/));
  });

  it("turns the store on for e-commerce projects only", () => {
    const client = briefClient();
    expect(startingSpec(client, { projectType: "ecommerce" }).spec.integrations.store.enabled).toBe(true);
    expect(startingSpec(client, { projectType: "brand_website" }).spec.integrations.store.enabled).toBe(false);
  });
});
