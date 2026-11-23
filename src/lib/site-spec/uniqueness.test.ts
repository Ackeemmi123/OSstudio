import { describe, expect, it } from "vitest";
import { companySpec } from "./test-helpers";
import { fingerprintOf, lookAlikes, suggestion, type OtherDesign } from "./uniqueness";

const brand = () => companySpec().brand;
const other = (projectId: string, clientName: string, edit: (b: OtherDesign["brand"]) => void = () => undefined): OtherDesign => {
  const b = brand();
  edit(b);
  return { projectId, clientId: `c-${projectId}`, clientName, brand: b };
};

describe("uniqueness in the studio", () => {
  it("reads the look of a company-design brand, and nothing else", () => {
    expect(fingerprintOf(brand())).toMatchObject({ direction: "editorial", palette: "pine", hero: "split", feel: "natural", motion: "calm" });
    const template = brand();
    template.designSystem = "template";
    expect(fingerprintOf(template)).toBeNull();
  });

  it("names a site with the same direction, colours and concept, and suggests what to change", () => {
    const mine = brand();
    mine.concept = { hero: "full", signature: "year", feel: "warm", motion: "lively" };
    const twin = other("p2", "Testlunds Snickeri (TEST)", (b) => (b.concept = { hero: "full", signature: "year", feel: "warm", motion: "lively" }));
    const cousin = other("p3", "Ekbacka (TEST)", (b) => (b.concept = { hero: "type", signature: "area", feel: "warm" }));
    const stranger = other("p4", "Kafé (TEST)", (b) => (b.servicesStyle = { direction: "cafe", palette: "terracotta" }));
    const found = lookAlikes(mine, [stranger, cousin, twin, other("p1", "Itself")], "p1");
    expect(found.map((f) => [f.other.clientName, f.level])).toEqual([
      ["Testlunds Snickeri (TEST)", "same"],
      ["Ekbacka (TEST)", "close"],
    ]);
    expect(found[0].shared).toEqual(["direction", "colours", "lettering", "motif", "first screen", "signature part", "photo treatment", "movement"]);
    expect(suggestion(found[0])).toMatch(/signature part/);
  });

  it("is quiet when only the direction is shared", () => {
    const other1 = other("p2", "B", (b) => (b.servicesStyle = { direction: "editorial", palette: "ember" }));
    expect(lookAlikes(brand(), [other1], "p1")).toEqual([]);
  });
});
