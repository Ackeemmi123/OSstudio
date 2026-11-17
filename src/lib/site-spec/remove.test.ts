import { describe, expect, it } from "vitest";
import { move, newSection, removePage, removeSection } from "./edit";
import { briefClient } from "./test-helpers";
import { templateSpec } from "./templates";
import { approvalBlockers, parseSiteSpec } from "./validate";

const client = briefClient();
const draft = (template: "services" | "shop" | "single" = "services") => structuredClone(templateSpec(client, { projectType: "website" }, template, ["en"]).spec);
const valid = (spec: ReturnType<typeof draft>) => {
  const parsed = parseSiteSpec(spec);
  expect(parsed.ok ? [] : parsed.issues).toEqual([]);
};

describe("removing and rearranging a draft", () => {
  it("removing a section takes its unfilled image with it, so it stops blocking approval", () => {
    const spec = draft();
    const before = spec.assets.length;
    const hero = spec.pages[0].sections[0];
    const image = hero.kind === "hero" ? hero.mediaAssetId : undefined;
    removeSection(spec, 0, 0);
    expect(spec.assets).toHaveLength(before - 1);
    expect(spec.assets.some((a) => a.id === image)).toBe(false);
    valid(spec);
  });

  it("keeps an image another section still uses", () => {
    const spec = draft();
    const hero = spec.pages[0].sections[0];
    const image = hero.kind === "hero" ? hero.mediaAssetId! : "";
    const about = spec.pages.find((p) => p.id === "about")!.sections[0];
    if (about.kind === "text_media") about.mediaAssetId = image;
    removeSection(spec, 0, 0);
    expect(spec.assets.some((a) => a.id === image)).toBe(true);
  });

  it("never removes a stored image, so its rights record stays with the spec", () => {
    const spec = draft();
    const hero = spec.pages[0].sections[0];
    const image = hero.kind === "hero" ? hero.mediaAssetId! : "";
    const asset = spec.assets.find((a) => a.id === image)!;
    asset.fileId = "00000000-0000-4000-8000-000000000001";
    asset.origin = "client_supplied";
    removeSection(spec, 0, 0);
    expect(spec.assets.some((a) => a.id === image)).toBe(true);
  });

  it("removes an unwritten form with its contact section, but keeps one someone wrote", () => {
    const spec = draft();
    const contactPage = spec.pages.findIndex((p) => p.id === "contact");
    const written = structuredClone(spec);
    removeSection(spec, contactPage, 0);
    expect(spec.forms).toEqual([]);
    expect(approvalBlockers(spec, client).map((b) => b.path)).not.toContain("forms.0.consentText.en");
    written.forms[0].consentText.en = "We use your details only to answer you.";
    removeSection(written, contactPage, 0);
    expect(written.forms).toHaveLength(1);
  });

  it("removing a page leaves no button pointing nowhere", () => {
    const spec = draft();
    removePage(spec, spec.pages.findIndex((p) => p.id === "contact"));
    valid(spec);
    expect(spec.strategy.primaryCta?.targetPageId).toBe("home");
  });

  it("removing a shop's page keeps the rest working", () => {
    const spec = draft("shop");
    removePage(spec, spec.pages.findIndex((p) => p.id === "shop"));
    valid(spec);
  });

  it("removing the privacy page is allowed, and nothing else depends on it", () => {
    const spec = draft();
    removePage(spec, spec.pages.findIndex((p) => p.id === "privacy"));
    valid(spec);
  });

  it("moves and adds sections, and stays valid", () => {
    const spec = draft();
    const ids = spec.pages[0].sections.map((s) => s.id);
    spec.pages[0].sections = move(spec.pages[0].sections, 0, 1);
    expect(spec.pages[0].sections.map((s) => s.id)).toEqual([ids[1], ids[0], ...ids.slice(2)]);
    spec.pages[0].sections.push(newSection(spec, "faq"));
    valid(spec);
  });
});
