import { describe, expect, it } from "vitest";
import { build } from "../../../design-systems/services";
import { siteContent } from "../../../design-systems/services/content";
import { briefClient, companySpec } from "./test-helpers";
import { servicesContent } from "./to-services";
import { approvalBlockers } from "./validate";

describe("drawing a spec with the company design", () => {
  it("maps the services template, once written, into the design's content", () => {
    const result = servicesContent(companySpec(), {}, { prototype: { madeBy: "Axivo" } });
    expect(result.ok ? [] : result.missing).toEqual([]);
    if (!result.ok) return;
    expect(siteContent.safeParse(result.content).success).toBe(true);
    expect(result.content.prototype).toEqual({ madeBy: "Axivo" });
    expect(result.content.business).toMatchObject({ email: "info@example.fi", phone: "040 123 4567" });
    expect(result.design.direction).toBe("editorial");
    const paths = build({ content: result.content, design: result.design }).map((file) => file.path);
    for (const path of Object.values(result.pages)) expect(paths).toContain(path);
  });

  it("uses the style the spec chose", () => {
    const spec = companySpec();
    spec.brand.servicesStyle = { direction: "statement", palette: "ember", motif: "pipe" };
    const result = servicesContent(spec, {}, { prototype: { madeBy: "Axivo" } });
    expect(result.ok && result.design).toMatchObject({ direction: "statement", palette: "ember", motif: "pipe" });
  });

  it("shows people and quotes only with their consent", () => {
    const spec = companySpec();
    const team = spec.pages.flatMap((p) => p.sections).find((s) => s.kind === "team");
    const quotes = spec.pages.flatMap((p) => p.sections).find((s) => s.kind === "testimonials");
    const without = servicesContent(spec, {}, { prototype: { madeBy: "Axivo" } });
    expect(without.ok && without.content.about.people).toEqual([]);
    expect(without.ok && without.content.proof.quotes).toEqual([]);
    if (team?.kind === "team") team.items.forEach((item) => (item.consent = true));
    if (quotes?.kind === "testimonials") quotes.items.forEach((item) => (item.consent = true));
    const withConsent = servicesContent(spec, {}, { prototype: { madeBy: "Axivo" } });
    if (team?.kind === "team") expect(withConsent.ok && withConsent.content.about.people.length).toBe(team.items.length);
    if (quotes?.kind === "testimonials") expect(withConsent.ok && withConsent.content.proof.quotes.length).toBeGreaterThan(0);
  });

  it("says what is missing instead of drawing a gap", () => {
    const spec = companySpec();
    spec.pages = spec.pages.filter((page) => !page.sections.some((s) => s.kind === "contact"));
    const result = servicesContent(spec, {}, { prototype: { madeBy: "Axivo" } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.missing.join(" ")).toMatch(/Contact page/);
  });

  it("blocks approval while the company design cannot draw the spec", () => {
    const spec = companySpec();
    const hero = spec.pages[0].sections.find((s) => s.kind === "hero");
    if (hero?.kind === "hero") hero.eyebrow = { sv: "" };
    expect(approvalBlockers(spec, briefClient()).map((b) => b.message)).toContain("Company design: The hero's eyebrow (who the site is for) is empty.");
  });
});
