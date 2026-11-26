/**
 * One-click fills for what every draft needs and nobody enjoys writing: the
 * studio's standard form, contact and privacy texts, and search descriptions taken
 * from the page's own words. They only fill what is empty or still an
 * instruction in brackets; nothing a person wrote is replaced. No AI.
 */
import type { SiteLocale } from "./catalog";
import type { LocalizedText, SiteSpec } from "./schema";
import { findPrivacyPage, standardTexts, tracks } from "./standard-texts";
import { isPlaceholderText, visibleTexts } from "./texts";

const DESCRIPTION_MAX = 155;

const open = (value: LocalizedText | undefined, locale: SiteLocale) => {
  const text = value?.[locale]?.trim() ?? "";
  return !text || isPlaceholderText(text);
};

/** Fills a localized text where it is empty or an instruction. Returns how many languages it filled. */
function fill(target: LocalizedText, source: LocalizedText, locales: readonly SiteLocale[]): number {
  let filled = 0;
  for (const locale of locales) {
    if (open(target, locale) && source[locale]) {
      target[locale] = source[locale];
      filled += 1;
    }
  }
  return filled;
}

/** The standard form and privacy texts, where they are still missing. Null when the client has no e-mail. */
export function fillStandardTexts(spec: SiteSpec, client: { name: string; email: string | null }): { spec: SiteSpec; filled: number } | null {
  const locales = spec.locales.available;
  const standard = standardTexts(client, locales, tracks(spec));
  if (!standard) return null;
  const next = structuredClone(spec);
  let filled = 0;
  for (const form of next.forms) {
    filled += fill(form.consentText, standard.consent, locales);
    form.submitLabel ??= {};
    filled += fill(form.submitLabel, standard.submit, locales);
    form.replyNote ??= {};
    filled += fill(form.replyNote, standard.reply, locales);
  }
  const privacy = findPrivacyPage(next);
  const body = privacy?.sections.find((section) => section.kind === "text") as { body?: LocalizedText } | undefined;
  if (body) {
    body.body ??= {};
    filled += fill(body.body, standard.privacy, locales);
  }
  if (privacy) filled += fill(privacy.seo.description, standard.privacyDescription, locales);
  // The text beside the contact form, when the draft had nothing from the client to say there.
  for (const page of next.pages) {
    for (const section of page.sections) {
      if (section.kind === "contact") filled += fill(section.body, standard.contact, locales);
    }
  }
  return { spec: next, filled };
}

/** The first sentences of a text that fit a search result. */
function summary(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= DESCRIPTION_MAX) return flat;
  const sentences = flat.match(/[^.!?]+[.!?]+/g) ?? [];
  let out = "";
  for (const sentence of sentences) {
    if ((out + sentence).trim().length > DESCRIPTION_MAX) break;
    out += sentence;
  }
  if (out.trim()) return out.trim();
  const cut = flat.slice(0, DESCRIPTION_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

/**
 * Search descriptions from each page's own text: its first finished passage of
 * at least a sentence. The home page's also becomes the site's default.
 */
export function fillSearchDescriptions(spec: SiteSpec): { spec: SiteSpec; filled: number } {
  const next = structuredClone(spec);
  const texts = visibleTexts(spec).filter((t) => t.locale && !isPlaceholderText(t.text) && t.text.length >= 40 && /\.sections\./.test(t.path));
  const firstText = (page: number, locale: SiteLocale) => texts.find((t) => t.path.startsWith(`pages.${page}.sections.`) && t.locale === locale)?.text;
  let filled = 0;
  next.pages.forEach((page, p) => {
    for (const locale of next.locales.available) {
      if (!open(page.seo.description, locale)) continue;
      const text = firstText(p, locale);
      if (text) {
        page.seo.description[locale] = summary(text);
        filled += 1;
      }
    }
  });
  for (const locale of next.locales.available) {
    const home = next.pages[0]?.seo.description[locale];
    if (open(next.seo.defaultDescription, locale) && home && !isPlaceholderText(home)) {
      next.seo.defaultDescription[locale] = home;
      filled += 1;
    }
  }
  return { spec: next, filled };
}
