import { describe, expect, it } from "vitest";
import { SPEC_LIMITS } from "./catalog";
import type { SiteSpec } from "./schema";
import { briefClient, completeSpec } from "./test-helpers";
import { parseSiteSpec } from "./validate";

function spec(): SiteSpec {
  return completeSpec(briefClient());
}

function issues(value: unknown): string[] {
  const parsed = parseSiteSpec(value);
  return parsed.ok ? [] : parsed.issues.map((i) => `${i.path}: ${i.message}`);
}

describe("SiteSpec v1 shape", () => {
  it("accepts a complete spec and returns it unchanged", () => {
    const value = spec();
    const parsed = parseSiteSpec(value);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.spec).toEqual(value);
  });

  it("refuses unknown keys, so renderer settings cannot slip in", () => {
    expect(issues({ ...spec(), duda: { templateId: 1 } }).join()).toMatch(/duda|Unrecognized/i);
    const value = spec();
    (value.pages[0].sections[0] as Record<string, unknown>).widgetId = "abc";
    expect(issues(value)).not.toEqual([]);
  });

  it("refuses another schema version", () => {
    expect(issues({ ...spec(), specVersion: 2 })[0]).toMatch(/^specVersion/);
  });

  it("refuses malformed values and names the field", () => {
    const value = spec();
    value.brand.colors.primary = "blue";
    value.pages[0].seo.title.en = "x".repeat(61);
    value.pages[1].slug.en = "Contact Us";
    const found = issues(value);
    expect(found.some((i) => i.startsWith("brand.colors.primary"))).toBe(true);
    expect(found.some((i) => i.startsWith("pages.0.seo.title.en"))).toBe(true);
    expect(found.some((i) => i.startsWith("pages.1.slug.en"))).toBe(true);
  });

  it("refuses a section variant from another kind", () => {
    const value = spec();
    (value.pages[0].sections[0] as { variant: string }).variant = "accordion";
    expect(issues(value)[0]).toMatch(/^pages\.0\.sections\.0/);
  });

  it("refuses control characters in text", () => {
    const value = spec();
    value.seo.siteName.en = "Bakery‮";
    expect(issues(value)[0]).toMatch(/control characters/);
  });

  it("refuses a spec larger than the limit", () => {
    const value = spec();
    value.strategy.tone = "x".repeat(SPEC_LIMITS.bytes);
    expect(issues(value)[0]).toMatch(/larger than/);
  });
});

describe("SiteSpec references", () => {
  it("refuses duplicate ids", () => {
    const value = spec();
    value.pages[1].sections[0].id = value.pages[0].sections[0].id;
    expect(issues(value)).toContainEqual(expect.stringMatching(/used twice/));
  });

  it("refuses buttons, images and forms that point nowhere", () => {
    const value = spec();
    const hero = value.pages[0].sections[0];
    if (hero.kind !== "hero") throw new Error("expected a hero");
    hero.buttons[0].targetPageId = "missing";
    hero.mediaAssetId = "no-image";
    const contact = value.pages[1].sections[0];
    if (contact.kind !== "contact") throw new Error("expected a contact section");
    contact.formId = "no-form";
    const found = issues(value).join("\n");
    expect(found).toMatch(/page that does not exist/);
    expect(found).toMatch(/image "no-image" does not exist/);
    expect(found).toMatch(/form does not exist/);
  });

  it("keeps the first page as the home page with an empty address", () => {
    const value = spec();
    value.pages[0].slug.en = "start";
    expect(issues(value)).toContainEqual(expect.stringMatching(/home page/));
    const other = spec();
    other.pages[1].slug.en = "";
    expect(issues(other)).toContainEqual(expect.stringMatching(/Only the home page/));
  });

  it("nests pages one level only, and refuses two pages at one address", () => {
    const value = spec();
    value.pages.push(
      { ...structuredClone(value.pages[1]), id: "team", slug: { en: "team" }, parentId: "contact", sections: [] },
      { ...structuredClone(value.pages[1]), id: "deep", slug: { en: "deep" }, parentId: "team", sections: [] },
      { ...structuredClone(value.pages[1]), id: "again", sections: [] },
    );
    const found = issues(value).join("\n");
    expect(found).toMatch(/one level only/);
    expect(found).toMatch(/Two pages have the address \/contact/);
  });

  it("needs a way to answer every form", () => {
    const value = spec();
    value.forms[0].fields = ["name", "message"];
    expect(issues(value)).toContainEqual(expect.stringMatching(/email or phone/));
  });

  it("needs the default language among the website's languages", () => {
    const value = spec();
    value.locales.default = "fi";
    expect(issues(value)).toContainEqual(expect.stringMatching(/default language/));
  });
});
