import { describe, expect, it } from "vitest";
import { SECTION_KINDS } from "./catalog";
import { freshId, move, newForm, newItem, newPage, newPlaceholderImage, newSection, slugify } from "./edit";
import { briefClient, completeSpec } from "./test-helpers";
import { parseSiteSpec } from "./validate";

describe("editing helpers", () => {
  it("makes every kind of section, with items, as a valid draft", () => {
    const spec = completeSpec(briefClient());
    for (const kind of SECTION_KINDS) {
      const section = newSection(spec, kind);
      if ("items" in section) (section.items as unknown[]).push(newItem(spec, kind));
      spec.pages[0].sections.push(section);
    }
    const parsed = parseSiteSpec(spec);
    expect(parsed.ok ? [] : parsed.issues).toEqual([]);
  });

  it("adds pages, images and forms that fit the spec", () => {
    const spec = completeSpec(briefClient());
    spec.pages.push(newPage(spec, "Contact"));
    spec.assets.push(newPlaceholderImage(spec, "Shop front"));
    spec.forms.push(newForm(spec));
    expect(spec.pages[2].slug.en).toBe("contact-2");
    expect(parseSiteSpec(spec).ok).toBe(true);
  });

  it("makes addresses and ids from any title", () => {
    expect(slugify("  Café & Bakery – Kallio ")).toBe("cafe-bakery-kallio");
    expect(slugify("Ääkköset")).toBe("aakkoset");
    const spec = completeSpec(briefClient());
    expect(freshId(spec, "home")).toBe("home-1");
    expect(freshId(spec, "2024 menu")).toBe("x-2024-menu-1");
  });

  it("moves entries without leaving the list", () => {
    expect(move([1, 2, 3], 0, 1)).toEqual([2, 1, 3]);
    expect(move([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
  });
});
