import { describe, expect, it } from "vitest";
import { newPage, newPlaceholderImage, newSection } from "@/lib/site-spec/edit";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { briefClient, completeSpec } from "@/lib/site-spec/test-helpers";
import { buildRenderModel, pageHref } from "./model";

function spec(): SiteSpec {
  const value = completeSpec(briefClient());
  const about = newPage(value, "About");
  const team = { ...newPage(value, "Team"), parentId: about.id };
  const legal = { ...newPage(value, "Privacy"), nav: "footer" as const };
  value.pages.push(about, team, legal);
  return value;
}

describe("render model", () => {
  it("renders the home page in the default language, with menus in sitemap order and nesting", () => {
    const model = buildRenderModel(spec(), { showMissing: false });
    expect(model.lang).toBe("en");
    expect(model.page).toMatchObject({ id: "home", href: "/" });
    expect(model.mainNav.map((n) => [n.label.text, n.href, n.current])).toEqual([
      ["Home", "/", true],
      ["Contact", "/contact", false],
      ["About", "/about", false],
    ]);
    expect(model.mainNav[2].children.map((c) => c.href)).toEqual(["/about/team"]);
    expect(model.footerNav.map((n) => n.href)).toEqual(["/privacy"]);
    expect(model.pages.map((p) => [p.title, p.depth])).toEqual([["Home", 0], ["Contact", 0], ["About", 0], ["Team", 1], ["Privacy", 0]]);
  });

  it("falls back to the home page and default language for unknown ones", () => {
    const model = buildRenderModel(spec(), { pageId: "nope", locale: "de", showMissing: false });
    expect([model.page.id, model.lang]).toEqual(["home", "en"]);
  });

  it("resolves buttons to their page and address in the chosen language", () => {
    const value = spec();
    value.locales.available = ["en", "fi"];
    value.pages[1].slug.fi = "yhteystiedot";
    const model = buildRenderModel(value, { locale: "fi", showMissing: false });
    expect(model.sections[0].buttons[0]).toMatchObject({ pageId: "contact", href: "/fi/yhteystiedot" });
    expect(pageHref(value, value.pages[0], "fi")).toBe("/fi/");
  });

  it("marks what is missing only when asked, and always counts it", () => {
    const value = spec();
    value.locales.available = ["en", "fi"];
    const hidden = buildRenderModel(value, { locale: "fi", showMissing: false });
    const shown = buildRenderModel(value, { locale: "fi", showMissing: true });
    expect(hidden.sections[0].heading).toEqual({ text: "", missing: null });
    expect(shown.sections[0].heading).toEqual({ text: "", missing: "Hero: heading (Finnish)" });
    expect(hidden.missingCount).toBe(shown.missingCount);
    expect(shown.missingCount).toBeGreaterThan(0);
    expect(buildRenderModel(value, { locale: "en", showMissing: true }).missingCount).toBe(0);
  });

  it("labels placeholder images and images without alternative text", () => {
    const value = spec();
    const photo = newPlaceholderImage(value, "Cake on the counter");
    value.assets.push(photo);
    const hero = value.pages[0].sections[0];
    if (hero.kind !== "hero") throw new Error("expected a hero");
    hero.mediaAssetId = photo.id;
    const model = buildRenderModel(value, { showMissing: true });
    expect(model.sections[0].image).toMatchObject({ placeholder: true, alt: "", missing: "Cake on the counter: image file, alternative text (English)" });
  });

  it("resolves every kind of section, and a contact section's form", () => {
    const value = spec();
    const kinds = ["text", "text_media", "features", "services", "testimonials", "gallery", "team", "faq", "cta", "map"] as const;
    for (const kind of kinds) value.pages[0].sections.push(newSection(value, kind));
    const model = buildRenderModel(value, { showMissing: false });
    expect(model.sections.map((s) => s.kind)).toEqual(["hero", "text", ...kinds]);
    const contact = buildRenderModel(value, { pageId: "contact", showMissing: false }).sections[0];
    expect(contact.form).toMatchObject({ purpose: "Contact", fields: [{ name: "name" }, { name: "email" }, { name: "message" }], consent: { text: "We use your details only to answer you." } });
  });
});
