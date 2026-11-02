import { describe, expect, it } from "vitest";
import { briefClient, completeSpec } from "./test-helpers";
import { qualityWarnings } from "./checks";
import { newPage, newPlaceholderImage, newSection } from "./edit";
import { approvalBlockers } from "./validate";
import type { SiteSpec } from "./schema";

const spec = () => completeSpec(briefClient());
const warnings = (s: SiteSpec, files: Parameters<typeof qualityWarnings>[1] = []) => qualityWarnings(s, files).map((w) => w.message);
const blockers = (s: SiteSpec) => approvalBlockers(s, briefClient()).map((b) => b.message);
const swedish = (s: SiteSpec) => {
  s.locales.available = ["en", "sv"];
  return s;
};

describe("what must be fixed before approval", () => {
  it("passes a complete spec", () => {
    expect(blockers(spec())).toEqual([]);
  });

  it("refuses leftover draft text, and says where", () => {
    const s = spec();
    const hero = s.pages[0].sections[0];
    if (hero.kind === "hero") hero.heading.en = "Lorem ipsum dolor";
    s.forms[0].consentText.en = "TODO write this";
    const found = blockers(s);
    expect(found).toContainEqual(expect.stringMatching(/Home › Hero: the heading still says "Lorem ipsum"|Hero.*still says "Lorem ipsum"/));
    expect(found).toContainEqual(expect.stringMatching(/consent text still says "TODO"/));
  });

  it("does not mistake ordinary words for leftover text", () => {
    const s = spec();
    const hero = s.pages[0].sections[0];
    if (hero.kind === "hero") hero.heading.en = "A todo list for every kitchen";
    expect(blockers(s)).toEqual([]);
  });

  it("refuses grey text that is hard to read", () => {
    const s = spec();
    s.brand.colors.neutral[2] = "#BBBBBB";
    expect(blockers(s)).toContainEqual(expect.stringMatching(/Grey text on the background needs a contrast of at least 4.5:1/));
  });

  it("refuses a primary colour no button text can be read on", () => {
    const s = spec();
    s.brand.colors.primary = "#787878";
    s.brand.colors.background = "#FFFFFF";
    expect(blockers(s)).toContainEqual(expect.stringMatching(/Button text on the primary colour/));
  });
});

describe("what is worth checking", () => {
  it("has nothing else to say about a complete spec of a test client with short descriptions", () => {
    expect(warnings(spec()).filter((w) => !/search description is short|says "\(test\)"/.test(w))).toEqual([]);
  });

  it("notices test text", () => {
    const s = spec();
    s.seo.siteName.en = "Bakery (TEST)";
    expect(warnings(s)).toContainEqual(expect.stringMatching(/site name says "\(test\)"/));
  });

  it("notices text that may not be translated, but not short names", () => {
    const s = swedish(spec());
    s.seo.siteName = { en: "Bakery", sv: "Bakery" };
    s.seo.defaultDescription = { en: "Cakes baked to order", sv: "Cakes baked to order" };
    const found = warnings(s);
    expect(found).toContainEqual(expect.stringMatching(/default description is the same in English and Swedish/));
    expect(found.join(" ")).not.toMatch(/site name is the same/);
  });

  it("notices vague alternative texts", () => {
    const s = spec();
    const image = newPlaceholderImage(s, "Shop front");
    image.alt.en = "photo";
    s.assets.push(image);
    expect(warnings(s)).toContainEqual(expect.stringMatching(/Shop front: the alternative text should say/));
    s.assets[0].alt.en = "IMG_2041.jpg";
    expect(warnings(s)).toContainEqual(expect.stringMatching(/the alternative text should say/));
    s.assets[0].alt.en = "The shop front in the morning";
    expect(warnings(s).join(" ")).not.toMatch(/alternative text should say/);
  });

  it("notices duplicate and short search texts, except on hidden pages", () => {
    const s = spec();
    const text = "Order celebration cakes baked fresh to your order in Kallio.";
    s.pages[0].seo.description.en = text;
    s.pages[1].seo.description.en = text;
    s.pages[1].seo.title.en = s.pages[0].seo.title.en;
    const found = warnings(s);
    expect(found).toContainEqual(expect.stringMatching(/have the same search description/));
    expect(found).toContainEqual(expect.stringMatching(/have the same search title/));
    s.pages[1].seo.noindex = true;
    expect(warnings(s).join(" ")).not.toMatch(/same search/);
    s.pages[0].seo.description.en = "Cakes.";
    expect(warnings(s)).toContainEqual(expect.stringMatching(/search description is short/));
  });

  it("notices pages nothing leads to", () => {
    const s = spec();
    const page = newPage(s, "Hidden away");
    page.nav = "none";
    s.pages.push(page);
    expect(warnings(s)).toContainEqual(expect.stringMatching(/Hidden away: no menu or button leads/));
    page.nav = "footer";
    expect(warnings(s).join(" ")).not.toMatch(/Hidden away/);
  });

  it("notices a home page without the main call to action", () => {
    const s = spec();
    const hero = s.pages[0].sections[0];
    if (hero.kind === "hero") hero.buttons = [];
    expect(warnings(s)).toContainEqual(expect.stringMatching(/has no button for the main call to action/));
  });

  it("notices a list with no heading", () => {
    const s = spec();
    const section = newSection(s, "features");
    if (section.kind === "features") section.items = [{ id: "one", title: { en: "Fresh" }, body: {} }];
    s.pages[0].sections.push(section);
    expect(warnings(s)).toContainEqual(expect.stringMatching(/section with a list has no heading/));
    if (section.kind === "features") section.heading.en = "Why us";
    expect(warnings(s).join(" ")).not.toMatch(/no heading/);
  });

  it("notices images and forms no page uses", () => {
    const s = spec();
    s.assets.push(newPlaceholderImage(s, "Spare photo"));
    s.forms.push({ ...s.forms[0], id: "spare" });
    const found = warnings(s);
    expect(found).toContainEqual(expect.stringMatching(/Spare photo: no page uses this image/));
    expect(found).toContainEqual(expect.stringMatching(/Form spare: no page uses this form/));
  });

  it("notices stored images too small for their place, and heavy pages", () => {
    const s = spec();
    const image = { ...newPlaceholderImage(s, "Shop front"), fileId: "file-1", origin: "client_supplied" as const };
    s.assets.push(image);
    const hero = s.pages[0].sections[0];
    if (hero.kind === "hero") hero.mediaAssetId = image.id;
    expect(warnings(s, [{ id: "file-1", width: 640, byteSize: 100_000 }])).toContainEqual(expect.stringMatching(/Shop front is 640 px wide/));
    expect(warnings(s, [{ id: "file-1", width: 1600, byteSize: 100_000 }]).join(" ")).not.toMatch(/px wide/);
    expect(warnings(s, [{ id: "file-1", width: 1600, byteSize: 6 * 1024 * 1024 }])).toContainEqual(expect.stringMatching(/has 6 MB of images/));
  });

  it("points every warning at a place in the spec", () => {
    const s = spec();
    s.assets.push(newPlaceholderImage(s, "Spare photo"));
    for (const warning of qualityWarnings(s)) expect(warning.path).not.toBe("");
  });
});
