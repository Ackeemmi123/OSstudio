import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { renderPreviewDocument } from "@/lib/site-render/document";
import { buildRenderModel } from "@/lib/site-render/model";
import { SECTION_KINDS, SECTION_VARIANTS } from "@/lib/site-spec/catalog";
import { newItem, newPage, newSection } from "@/lib/site-spec/edit";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { briefClient, completeSpec } from "@/lib/site-spec/test-helpers";

/**
 * Draws the preview's pages for tests/e2e/preview-accessibility.spec.ts, which
 * cannot draw them itself: Playwright compiles JSX its own way, which React's
 * server renderer does not understand.
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


it("draws every section type to a file", () => {
  const spec = everySection();
  const pages = spec.pages.map((page) => ({
    id: page.id,
    html: renderPreviewDocument(spec, buildRenderModel(spec, { pageId: page.id, showMissing: false, imageFiles: { "file-1": { url: TINY_IMAGE, width: 1, height: 1 } } })),
  }));
  const file = process.env.PREVIEW_PAGES_FILE ?? "";
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(pages));
});
