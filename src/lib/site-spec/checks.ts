/**
 * What is worth a second look before a website spec is approved. None of this
 * stops anything; what must stop an approval is in `approvalBlockers`. Thresholds
 * are cautious on purpose: a warning that is usually wrong teaches people to
 * ignore all of them.
 */
import type { SiteAssetRecord } from "@/lib/domain/types";
import { SITE_LOCALE_LABELS, type SiteLocale } from "./catalog";
import type { SiteSpec, SiteSpecSection } from "./schema";
import { isPlaceholderText, pageLabel, visibleTexts } from "./texts";
import { assetIdsOf, buttonsOf, type SpecIssue } from "./validate";

/** What a warning needs to know about a stored image. */
export type ImageFileSize = Pick<SiteAssetRecord, "id" | "width" | "byteSize">;

const SHORT_DESCRIPTION = 50;
/** Enough words that matching text is unlikely to be a name or a brand. */
const WORDS_TO_COMPARE = 3;
const HEAVY_PAGE_BYTES = 5 * 1024 * 1024;
const VAGUE_ALT = /^(image|img|photo|picture|logo|bild|foto|kuva|kuvake)\.?$|\.(jpe?g|png|webp)$/i;

/** The width below which an image may look soft where it is used. */
function widthNeeded(section: SiteSpecSection): number {
  if (section.kind === "hero") return 1000;
  if (section.kind === "text_media") return 600;
  if (section.kind === "gallery") return 400;
  return 0;
}

export function qualityWarnings(spec: SiteSpec, files: readonly ImageFileSize[] = []): SpecIssue[] {
  const warnings: SpecIssue[] = [];
  // A template's instructions already block approval, so they need no second look.
  const texts = visibleTexts(spec).filter((entry) => !isPlaceholderText(entry.text));

  for (const { path, name, text } of texts) {
    if (/\(test\)/i.test(text)) warnings.push({ path, message: `${name} says "(test)".` });
  }

  // The same words in two languages usually means one was not translated.
  const byField = new Map<string, typeof texts>();
  for (const entry of texts) {
    if (!entry.locale) continue;
    const field = entry.path.slice(0, entry.path.lastIndexOf("."));
    byField.set(field, [...(byField.get(field) ?? []), entry]);
  }
  for (const entries of byField.values()) {
    const [first, ...rest] = entries;
    const same = rest.find((other) => other.text === first.text);
    if (same && first.text.split(/\s+/).length >= WORDS_TO_COMPARE) {
      warnings.push({ path: same.path, message: `${first.name} is the same in ${SITE_LOCALE_LABELS[first.locale as SiteLocale]} and ${SITE_LOCALE_LABELS[same.locale as SiteLocale]}, so it may not be translated.` });
    }
  }

  spec.assets.forEach((asset, a) => {
    for (const locale of spec.locales.available) {
      if (VAGUE_ALT.test(asset.alt[locale]?.trim() ?? "")) {
        warnings.push({ path: `assets.${a}.alt.${locale}`, message: `${asset.description.trim() || `Image ${a + 1}`}: the alternative text should say what the image shows.` });
      }
    }
  });

  // Search texts, for the pages search engines may show.
  for (const locale of spec.locales.available) {
    const seen = { title: new Map<string, number>(), description: new Map<string, number>() };
    spec.pages.forEach((page, p) => {
      if (page.seo.noindex) return;
      const name = pageLabel(spec, page, p);
      for (const key of ["title", "description"] as const) {
        const text = page.seo[key][locale]?.trim();
        if (!text || isPlaceholderText(text)) continue;
        const earlier = seen[key].get(text);
        if (earlier !== undefined) warnings.push({ path: `pages.${p}.seo.${key}.${locale}`, message: `${pageLabel(spec, spec.pages[earlier], earlier)} and ${name} have the same search ${key}.` });
        else seen[key].set(text, p);
        if (key === "description" && text.length < SHORT_DESCRIPTION) warnings.push({ path: `pages.${p}.seo.description.${locale}`, message: `${name}: the search description is short, so search engines may write their own.` });
      }
    });
  }

  const allSections = spec.pages.flatMap((page) => page.sections);
  const buttonTargets = new Set(allSections.flatMap((section) => buttonsOf(section).map((b) => b.targetPageId)));
  if (spec.strategy.primaryCta) buttonTargets.add(spec.strategy.primaryCta.targetPageId);

  spec.pages.forEach((page, p) => {
    if (p > 0 && page.nav === "none" && !buttonTargets.has(page.id)) {
      warnings.push({ path: `pages.${p}`, message: `${pageLabel(spec, page, p)}: no menu or button leads to this page.` });
    }
  });

  const cta = spec.strategy.primaryCta;
  const home = spec.pages[0];
  if (cta && home && !home.sections.some((section) => buttonsOf(section).some((b) => b.targetPageId === cta.targetPageId))) {
    warnings.push({ path: "pages.0.sections", message: `${pageLabel(spec, home, 0)} has no button for the main call to action.` });
  }

  // A list's items are smaller headings, so the list needs a heading above them.
  spec.pages.forEach((page, p) => {
    page.sections.forEach((section, s) => {
      if ("items" in section && section.items.length > 0 && spec.locales.available.some((l) => !section.heading[l]?.trim())) {
        warnings.push({ path: `pages.${p}.sections.${s}.heading.${spec.locales.default}`, message: `${pageLabel(spec, page, p)}: a section with a list has no heading above it.` });
      }
    });
  });

  // Images and forms the website never shows.
  const usedAssets = new Set(allSections.flatMap(assetIdsOf));
  if (spec.brand.logoAssetId) usedAssets.add(spec.brand.logoAssetId);
  spec.assets.forEach((asset, a) => {
    if (!usedAssets.has(asset.id)) warnings.push({ path: `assets.${a}`, message: `${asset.description.trim() || `Image ${a + 1}`}: no page uses this image.` });
  });
  const usedForms = new Set(allSections.flatMap((section) => (section.kind === "contact" && section.formId ? [section.formId] : [])));
  spec.forms.forEach((form, f) => {
    if (!usedForms.has(form.id)) warnings.push({ path: `forms.${f}`, message: `Form ${form.id}: no page uses this form.` });
  });

  // Stored images: too small for where they are used, and heavy pages.
  const fileOf = (assetId: string) => {
    const fileId = spec.assets.find((asset) => asset.id === assetId)?.fileId;
    return fileId ? files.find((file) => file.id === fileId) : undefined;
  };
  spec.pages.forEach((page, p) => {
    page.sections.forEach((section, s) => {
      const needed = widthNeeded(section);
      for (const assetId of assetIdsOf(section)) {
        const file = fileOf(assetId);
        if (file && file.width < needed) {
          const asset = spec.assets.find((a) => a.id === assetId);
          warnings.push({ path: `pages.${p}.sections.${s}`, message: `${asset?.description.trim() || "An image"} is ${file.width} px wide, which may look soft here (${pageLabel(spec, page, p)}).` });
        }
      }
    });
    const onPage = new Set(page.sections.flatMap(assetIdsOf).flatMap((id) => { const file = fileOf(id); return file ? [file] : []; }));
    const bytes = [...onPage].reduce((sum, file) => sum + file.byteSize, 0);
    if (bytes > HEAVY_PAGE_BYTES) warnings.push({ path: `pages.${p}`, message: `${pageLabel(spec, page, p)} has ${Math.round(bytes / (1024 * 1024))} MB of images, which can make it slow.` });
  });

  return warnings;
}
