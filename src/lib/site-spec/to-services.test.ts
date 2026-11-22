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

describe("the café and atelier directions from a spec", () => {
  const image = (src: string) => ({ src, width: 1600, height: 1200, source: "Client", licence: "Client's own", showsPerson: false });

  function withContactDetails() {
    const spec = companySpec();
    for (const section of spec.pages.flatMap((page) => page.sections)) {
      if (section.kind === "contact") {
        section.address = { sv: "Torggatan 4, Ekenäs" };
        section.hours = { sv: "Ti–lö 9–17, sö 10–16" };
      }
    }
    return spec;
  }

  it("takes the address and opening hours from the contact section", () => {
    const result = servicesContent(withContactDetails(), {}, { prototype: { madeBy: "Axivo" } });
    expect(result.ok && result.content.business).toMatchObject({ address: "Torggatan 4, Ekenäs", hours: "Ti–lö 9–17, sö 10–16" });
  });

  it("brings a gallery of the client's pictures to the atelier direction only", () => {
    const spec = withContactDetails();
    spec.assets.push(
      { id: "room-1", kind: "photo", alt: { sv: "Köket i villan vid havet" }, origin: "client_supplied", description: "", fileId: "11111111-1111-4111-8111-111111111111" },
      { id: "room-2", kind: "photo", alt: { sv: "Vardagsrummet i kalksten och linne" }, origin: "client_supplied", description: "", fileId: "22222222-2222-4222-8222-222222222222" },
    );
    spec.pages[0].sections.push({ id: "work", kind: "gallery", variant: "grid", heading: { sv: "Rum vi har gjort klara" }, assetIds: ["room-1", "room-2"] } as never);
    const images = { "11111111-1111-4111-8111-111111111111": image("img/1.webp"), "22222222-2222-4222-8222-222222222222": image("img/2.webp") };

    spec.brand.servicesStyle = { direction: "atelier", palette: "slate" };
    const atelier = servicesContent(spec, images, { prototype: { madeBy: "Axivo" } });
    expect(atelier.ok ? [] : atelier.missing).toEqual([]);
    if (!atelier.ok) return;
    expect(atelier.content.gallery?.items.map((item) => item.caption.text)).toEqual(["Köket i villan vid havet", "Vardagsrummet i kalksten och linne"]);
    const home = build({ content: atelier.content, design: atelier.design }).find((file) => file.path === "index.html")!.text;
    expect(home).toContain('class="work-grid"');

    spec.brand.servicesStyle = { direction: "formal", palette: "slate" };
    const formal = servicesContent(spec, images, { prototype: { madeBy: "Axivo" } });
    expect(formal.ok && formal.content.gallery).toBeUndefined();
  });
});
