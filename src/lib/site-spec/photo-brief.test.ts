import { describe, expect, it } from "vitest";
import { photoBriefText, photoNeeds, photosInHand } from "./photo-brief";
import { companySpec } from "./test-helpers";

describe("the photo brief", () => {
  it("follows the concept: a wide photo for a full hero, everyday moments for that signature", () => {
    const spec = companySpec();
    spec.brand.concept = { hero: "full", signature: "everyday", feel: "mono" };
    expect(photoNeeds(spec).map((n) => [n.slot, n.count, n.required])).toEqual(expect.arrayContaining([["hero", "1", true], ["everyday", "3–5", true], ["place", "1–2", false]]));
    const text = photoBriefText(spec);
    expect(text).toContain("En bred bild av er plats eller ert arbete");
    expect(text).toContain("Bilder från en vanlig dag (3–5)");
    expect(text).toContain("svartvitt");
  });

  it("asks for no hero photo when the first screen is words only, and writes in the site's language", () => {
    const spec = companySpec();
    spec.brand.concept = { hero: "type" };
    spec.locales.default = "fi";
    expect(photoNeeds(spec).some((n) => n.slot === "hero")).toBe(false);
    expect(photoBriefText(spec)).toContain("Puhelimen kamera riittää");
  });

  it("gives industry advice and counts photos in hand", () => {
    const spec = companySpec();
    spec.strategy.industry = "cafe_restaurant";
    expect(photoBriefText(spec)).toContain("maten på disken");
    expect(photosInHand(spec)).toBe(0);
  });

  it("is empty for other designs", () => {
    const spec = companySpec();
    spec.brand.designSystem = "template";
    expect(photoNeeds(spec)).toEqual([]);
  });
});
