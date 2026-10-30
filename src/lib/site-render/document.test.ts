import { describe, expect, it } from "vitest";
import { SECTION_KINDS } from "@/lib/site-spec/catalog";
import { newItem, newPlaceholderImage, newSection } from "@/lib/site-spec/edit";
import { briefClient, completeSpec } from "@/lib/site-spec/test-helpers";
import { renderPreviewDocument } from "./document";
import { buildRenderModel } from "./model";

function render(edit?: (spec: ReturnType<typeof completeSpec>) => void, options: Parameters<typeof buildRenderModel>[1] = { showMissing: false }) {
  const spec = completeSpec(briefClient());
  edit?.(spec);
  return renderPreviewDocument(spec, buildRenderModel(spec, options));
}

describe("preview document", () => {
  it("is a complete document in the page's language, hidden from search engines, with no scripts", () => {
    const html = render();
    expect(html.startsWith("<!doctype html>\n<html lang=\"en\">")).toBe(true);
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain("Celebration cakes, made to order");
  });

  it("escapes text from the spec", () => {
    const html = render((spec) => {
      const hero = spec.pages[0].sections[0];
      if (hero.kind === "hero") hero.heading.en = '<script>alert("x")</script><img src=x onerror=alert(1)>';
      spec.seo.siteName.en = "</title><script>alert(1)</script>";
    });
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img/i);
    expect(html).toContain("&lt;script&gt;");
  });

  it("has one h1 per page, whether or not it starts with a hero", () => {
    expect(render().match(/<h1/g)).toHaveLength(1);
    const contact = completeSpec(briefClient());
    expect(renderPreviewDocument(contact, buildRenderModel(contact, { pageId: "contact", showMissing: false })).match(/<h1/g)).toHaveLength(1);
  });

  it("renders every kind of section", () => {
    const html = render((spec) => {
      for (const kind of SECTION_KINDS) {
        const section = newSection(spec, kind);
        if ("items" in section) (section.items as unknown[]).push(newItem(spec, kind));
        spec.pages[0].sections.push(section);
      }
    });
    for (const kind of SECTION_KINDS) expect(html).toContain(`sp-${kind}--`);
  });

  it("shows what is missing on drafts, and labels images with their alternative text", () => {
    const html = render(
      (spec) => {
        spec.locales.available = ["en", "fi"];
        const photo = newPlaceholderImage(spec, "Cake on the counter");
        photo.alt.fi = "Kakku tiskillä";
        spec.assets.push(photo);
        const hero = spec.pages[0].sections[0];
        if (hero.kind === "hero") hero.mediaAssetId = photo.id;
      },
      { locale: "fi", showMissing: true },
    );
    expect(html.startsWith("<!doctype html>\n<html lang=\"fi\">")).toBe(true);
    expect(html).toContain("Missing: Hero: heading (Finnish)");
    expect(html).toContain('aria-label="Kakku tiskillä"');
    expect(html).toContain("Missing: Cake on the counter: image file");
  });
});

describe("preview document with stored images", () => {
  it("shows a stored image from its signed link, with its alternative text and size, and nothing else from outside", () => {
    const url = "https://abc.supabase.co/storage/v1/object/sign/site-assets/s/c/f.webp?token=t";
    const spec = completeSpec(briefClient());
    const fileId = "5b2d8c41-0e3f-4a5b-9c6d-7e8f9a0b1c2d";
    spec.assets.push({ id: "hero-photo", kind: "photo", alt: { en: "Strawberry cake" }, origin: "client_supplied", description: "Cake", fileId });
    const hero = spec.pages[0].sections[0];
    if (hero.kind === "hero") hero.mediaAssetId = "hero-photo";
    const html = renderPreviewDocument(spec, buildRenderModel(spec, { showMissing: false, imageFiles: { [fileId]: { url, width: 1600, height: 1200 } } }));
    expect(html).toContain('alt="Strawberry cake"');
    expect(html).toContain('width="1600" height="1200"');
    expect(html).toMatch(/referrerpolicy="no-referrer"/i);
    expect(html.match(/https?:\/\/[^"\s]+/g)?.every((found) => found.startsWith("https://abc.supabase.co/storage/v1/object/sign/"))).toBe(true);
    expect(html).not.toMatch(/<script/i);
  });
});
