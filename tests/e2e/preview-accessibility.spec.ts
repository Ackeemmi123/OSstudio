import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { renderPreviewDocument } from "@/lib/site-render/document";
import { buildRenderModel } from "@/lib/site-render/model";
import { SECTION_KINDS, SECTION_VARIANTS } from "@/lib/site-spec/catalog";
import { newItem, newPage, newSection } from "@/lib/site-spec/edit";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { briefClient, completeSpec } from "@/lib/site-spec/test-helpers";

/**
 * The preview's templates, checked once for every website: every section type
 * in every layout, at phone and desktop width, with invented content. A tiny
 * inline image stands in for stored files. It needs no server and no client
 * data. What a person writes (alt texts, colours) is checked in the editor.
 */
const TINY_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==";

/** One page per section type, with a section in each of its layouts. */
function everySection(): SiteSpec {
  const spec = completeSpec(briefClient());
  spec.assets.push(
    { id: "stored", kind: "photo", alt: { en: "The bakery's shop front" }, origin: "client_supplied", description: "Shop front", fileId: "file-1" },
    { id: "waiting", kind: "photo", alt: { en: "A tray of cakes" }, origin: "placeholder", description: "Tray of cakes" },
  );
  for (const kind of SECTION_KINDS) {
    const page = newPage(spec, `Page for ${kind}`);
    page.nav = "main";
    page.seo.title.en = `Page for ${kind}`;
    spec.pages.push(page);
    for (const variant of SECTION_VARIANTS[kind]) {
      const section = newSection(spec, kind) as unknown as Record<string, unknown>;
      section.variant = variant;
      section.heading = { en: `A heading for ${kind}` };
      if ("subheading" in section) section.subheading = { en: "A short line under the heading." };
      if ("body" in section) section.body = { en: "Some body text that a visitor reads on the page." };
      if ("buttons" in section) section.buttons = [{ label: { en: "Get in touch" }, targetPageId: spec.pages[0].id }];
      if ("button" in section) section.button = { label: { en: "Get in touch" }, targetPageId: spec.pages[0].id };
      if (kind === "hero" || kind === "text_media") section.mediaAssetId = "stored";
      if (kind === "gallery") section.assetIds = ["stored", "waiting"];
      if ("items" in section) {
        const filled = { title: { en: "A title" }, body: { en: "Some text about it." }, quote: { en: "They made our day." }, author: "A customer", name: "A person", role: { en: "Baker" }, question: { en: "A question?" }, answer: { en: "An answer." }, assetId: "stored" };
        section.items = [newItem(spec, kind), { ...newItem(spec, kind), id: "second" }].map((item) => Object.fromEntries(Object.keys(item).concat(kind === "team" ? ["assetId"] : []).map((key) => [key, key === "id" ? item.id : filled[key as keyof typeof filled]])));
      }
      page.sections.push(section as never);
    }
  }
  return spec;
}

for (const [width, height, label] of [[1280, 800, "desktop"], [390, 800, "phone"]] as const) {
  test(`every section type passes the accessibility checks at ${label} width`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    const spec = everySection();
    for (const specPage of spec.pages) {
      const model = buildRenderModel(spec, { pageId: specPage.id, showMissing: false, imageFiles: { "file-1": { url: TINY_IMAGE, width: 1, height: 1 } } });
      await page.setContent(renderPreviewDocument(spec, model));
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const problems = results.violations.map((v) => `${specPage.id}: ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`);
      expect(problems).toEqual([]);
    }
  });
}
