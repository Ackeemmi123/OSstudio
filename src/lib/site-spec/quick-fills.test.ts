import { describe, expect, it } from "vitest";
import { fillSearchDescriptions, fillStandardTexts } from "./quick-fills";
import { briefClient } from "./test-helpers";
import { findPrivacyPage, isPrivacyPage } from "./standard-texts";
import { templateSpec } from "./templates";

const project = { projectType: "website" as const };

describe("one-click fills", () => {
  it("puts the standard texts into an older draft, and leaves what a person wrote", () => {
    const client = briefClient();
    const { spec } = templateSpec(client, project, "services", ["sv"]);
    spec.forms[0].submitLabel = { sv: "Beställ" };
    const result = fillStandardTexts(spec, { ...client, email: "hej@bageri.fi" })!;
    expect(result.filled).toBe(3);
    expect(result.spec.forms[0].submitLabel).toEqual({ sv: "Beställ" });
    expect(result.spec.forms[0].replyNote?.sv).toContain("hej@bageri.fi");
    const privacy = result.spec.pages.find((p) => p.id === "privacy")!.sections[0] as unknown as { body: { sv: string } };
    expect(privacy.body.sv).toContain("Personuppgiftsansvarig");
    expect(fillStandardTexts(spec, { ...client, email: null })).toBeNull();
  });

  it("finds a privacy page an AI draft named after its address, and only that page", () => {
    const client = briefClient();
    const { spec } = templateSpec(client, project, "services", ["sv"]);
    const privacy = spec.pages.find((p) => p.id === "privacy")!;
    privacy.id = "integritet";
    const text = privacy.sections[0] as unknown as { body: { sv?: string } };
    text.body = {};
    const result = fillStandardTexts(spec, { ...client, email: "hej@bageri.fi" })!;
    const filled = result.spec.pages.find((p) => p.id === "integritet")!.sections[0] as unknown as { body: { sv: string } };
    expect(filled.body.sv).toContain("Personuppgiftsansvarig");
    expect(findPrivacyPage(result.spec)?.id).toBe("integritet");
    expect(isPrivacyPage(spec.pages[0], 0)).toBe(false);
    expect(isPrivacyPage({ ...spec.pages[1], id: "page-3", slug: { sv: "tietosuoja" } }, 3)).toBe(true);
    expect(isPrivacyPage({ ...spec.pages[1], id: "om-oss", slug: { sv: "om-oss" } }, 1)).toBe(false);
  });

  it("writes search descriptions from the page's own text, within the length a search result shows", () => {
    const { spec } = templateSpec(briefClient(), project, "services", ["en"]);
    const hero = spec.pages[0].sections[0] as unknown as Record<string, Record<string, string>>;
    hero.subheading = { en: "Sourdough bread and celebration cakes, baked every morning in Turku. Order a cake two days ahead and pick it up fresh. We also cater for weddings, birthdays and company parties all around the region." };
    const result = fillSearchDescriptions(spec);
    expect(result.spec.pages[0].seo.description.en).toBe("Sourdough bread and celebration cakes, baked every morning in Turku. Order a cake two days ahead and pick it up fresh.");
    expect(result.spec.seo.defaultDescription.en).toBe(result.spec.pages[0].seo.description.en);
    expect(result.filled).toBeGreaterThanOrEqual(2);
  });
});
