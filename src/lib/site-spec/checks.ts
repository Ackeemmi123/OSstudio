/**
 * What is worth a second look before a website spec is approved. None of this
 * stops anything; what must stop an approval is in `approvalBlockers`. Thresholds
 * are cautious on purpose: a warning that is usually wrong teaches people to
 * ignore all of them.
 */
import type { SiteAssetRecord } from "@/lib/domain/types";
import { SECTION_LABELS, SITE_LOCALE_LABELS, type SiteLocale } from "./catalog";
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

/**
 * Words that make a claim someone could ask to see proof of. Only a person knows
 * whether the client confirmed it, so these ask for a look and never stop anything.
 */
const CLAIMS: { pattern: RegExp; what: string }[] = [
  { pattern: /\b\d+(?:[.,]\d+)?\s?%/, what: "a percentage" },
  { pattern: /\b\d[\d\s.,]*\+?\s*(?:clients?|customers?|projects?|years?|reviews?|kunder|projekt|år|recensioner|asiakasta|asiakkaita|projektia|vuotta|arvostelua)\b/i, what: "a number of customers, projects or years" },
  { pattern: /\b(?:award[- ]winning|awards?|prisbelönt\w*|palkittu\w*|palkinto\w*)/i, what: "an award" },
  { pattern: /\b(?:certified|accredited|licensed|certifierad\w*|auktoriserad\w*|sertifioitu\w*|auktorisoitu\w*)/i, what: "a certification" },
  { pattern: /\b(?:guarantee[ds]?|money[- ]back|garanti\w*|takuu\w*)/i, what: "a guarantee" },
  { pattern: /(?:#\s?1\b|\bnumber one\b|\bthe best\b|\bbest in\b|\bleading\b|\bbäst\w*|\bledande\b|\bparas\b|\bparhaat\b|\bjohtava\w*)/i, what: "a ranking" },
];

/** Pressure that is rarely true of a real business. */
const PRESSURE = /\b(?:only \d+ left|limited time|last chance|hurry|act now|ends (?:today|soon)|endast \d+ kvar|sista chansen|skynda|vain \d+ jäljellä|viimeinen mahdollisuus|kiirehdi)\b/i;

/** Headings that say nothing about this client. A template starts with them, and they read as a template. Contact and FAQ words stay out: visitors look for them. */
const GENERIC_HEADINGS = new Set(
  [
    "welcome", "about", "about us", "our services", "services", "what we do", "why choose us", "why us", "what customers say", "testimonials", "our products", "products",
    "välkommen", "om oss", "våra tjänster", "tjänster", "vad vi gör", "varför välja oss", "vad kunderna säger", "våra produkter",
    "tervetuloa", "meistä", "palvelumme", "palvelut", "mitä teemme", "miksi valita meidät", "asiakkaamme kertovat", "tuotteemme",
  ],
);

/** Long enough that a hero's heading stops being read at a glance. */
const LONG_HERO_HEADING = 90;
/** The same kind of section this many times in a row reads as a stack, not a page. */
const REPEATED_SECTIONS = 3;
/** What a shopper needs to know before buying, in each language. */
const SHOP_TERMS: { what: string; pattern: RegExp }[] = [
  { what: "delivery", pattern: /deliver|shipping|leverans|frakt|toimitus/i },
  { what: "returns", pattern: /return|retur|palautus/i },
  { what: "payment", pattern: /payment|pay by|betal|maksu/i },
];

/** Does the website tell people what the next step is, and is it honest about it? */
function journeyWarnings(spec: SiteSpec, written: { path: string; name: string; text: string }[]): SpecIssue[] {
  const warnings: SpecIssue[] = [];

  for (const { path, name, text } of written) {
    if (path.includes(".seo.") || path.startsWith("seo.") || path.startsWith("assets.")) continue;
    const claim = CLAIMS.find(({ pattern }) => pattern.test(text));
    if (claim) warnings.push({ path, message: `${name} makes a claim (${claim.what}). Keep it only if the client confirmed it.` });
    if (PRESSURE.test(text)) warnings.push({ path, message: `${name} puts pressure on visitors. Keep it only if it is really true.` });
  }

  spec.pages.forEach((page, p) => {
    const name = pageLabel(spec, page, p);
    let run = 1;
    page.sections.forEach((section, s) => {
      const path = `pages.${p}.sections.${s}`;
      for (const locale of spec.locales.available) {
        const heading = section.heading[locale]?.trim();
        if (heading && GENERIC_HEADINGS.has(heading.toLowerCase().replace(/[.!?]$/, ""))) {
          warnings.push({ path: `${path}.heading.${locale}`, message: `${name}: "${heading}" could be on any website. Say something about this client.` });
        }
      }
      if (section.kind === "hero") {
        if (!section.buttons.length) warnings.push({ path: `${path}.buttons`, message: `${name}: the hero has no button, so the next step isn't clear.` });
        for (const locale of spec.locales.available) {
          const heading = section.heading[locale]?.trim() ?? "";
          if (heading.length > LONG_HERO_HEADING && !isPlaceholderText(heading)) warnings.push({ path: `${path}.heading.${locale}`, message: `${name}: the hero's heading is long, so it may not be read at a glance.` });
        }
      }
      if (section.kind === "testimonials") {
        section.items.forEach((item, i) => {
          if (Object.values(item.quote).some((quote) => quote?.trim()) && !item.author.trim()) warnings.push({ path: `${path}.items.${i}.author`, message: `${name}: a quote doesn't say who said it.` });
        });
      }
      run = s > 0 && page.sections[s - 1].kind === section.kind ? run + 1 : 1;
      if (run === REPEATED_SECTIONS) warnings.push({ path, message: `${name}: ${REPEATED_SECTIONS} ${SECTION_LABELS[section.kind].label.toLowerCase()} sections in a row read as a stack. Vary them.` });
    });
    if (p === 0 && page.sections.length && page.sections[0].kind !== "hero") warnings.push({ path: `pages.0.sections.0`, message: `${name} doesn't open with a hero, so visitors may not see at once what this is.` });
  });

  // A form is where people hesitate. Saying what happens next helps, if it is true.
  const shown = new Set(spec.pages.flatMap((page) => page.sections.flatMap((section) => (section.kind === "contact" && section.variant !== "details_only" && section.formId ? [section.formId] : []))));
  spec.forms.forEach((form, f) => {
    if (shown.has(form.id) && !spec.locales.available.some((locale) => form.replyNote?.[locale]?.trim())) {
      warnings.push({ path: `forms.${f}.replyNote.${spec.locales.default}`, message: `Form ${form.id} doesn't say what happens after sending.` });
    }
  });

  // A shop must say these things, and nothing here pretends they are set up.
  if (spec.integrations.store.enabled || spec.pages.some((page) => page.id === "shop")) {
    const all = written.map((entry) => entry.text).join(" ");
    for (const { what, pattern } of SHOP_TERMS) {
      if (!pattern.test(all)) warnings.push({ path: "pages", message: `The shop doesn't mention ${what} anywhere, and shoppers look for this before buying.` });
    }
  }
  return warnings;
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

  // The set-apart words must be the heading's own ending, or the display shows them nowhere.
  spec.pages.forEach((page, p) => {
    page.sections.forEach((section, s) => {
      if (section.kind !== "hero") return;
      for (const locale of spec.locales.available) {
        const emphasis = section.emphasis?.[locale]?.trim();
        if (emphasis && !section.heading[locale]?.trim().endsWith(emphasis)) {
          warnings.push({ path: `pages.${p}.sections.${s}.emphasis.${locale}`, message: `${pageLabel(spec, page, p)}: the words to set apart are not the end of the heading, so they will not stand out.` });
        }
      }
    });
  });

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

  return [...warnings, ...journeyWarnings(spec, texts)];
}
