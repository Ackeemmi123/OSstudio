/**
 * Every text a visitor of the website reads, with where it lives in the spec
 * and a name for it. The checks read these, so a new field in the catalogue is
 * checked without further work.
 */
import { ITEM_FIELDS, SECTION_FIELDS, SECTION_LABELS, type SiteLocale } from "./catalog";
import type { LocalizedText, SiteSpec, SiteSpecPage } from "./schema";

export interface SpecText {
  path: string;
  /** "Home › Hero: the heading", in the person's words. */
  name: string;
  /** Per language, or null for a text written once for every language, such as a person's name. */
  locale: SiteLocale | null;
  text: string;
}

/** A page's name in the default language, whatever else is missing. */
export function pageLabel(spec: SiteSpec, page: SiteSpecPage, index: number): string {
  return page.title[spec.locales.default]?.trim() || page.title.en?.trim() || (index === 0 ? "Home page" : `Page ${index + 1}`);
}

export function visibleTexts(spec: SiteSpec): SpecText[] {
  const found: SpecText[] = [];
  const localized = (value: LocalizedText | undefined, path: string, name: string) => {
    for (const locale of spec.locales.available) {
      const text = value?.[locale]?.trim();
      if (text) found.push({ path: `${path}.${locale}`, name, locale, text });
    }
  };

  localized(spec.seo.siteName, "seo.siteName", "The site name");
  localized(spec.seo.defaultDescription, "seo.defaultDescription", "The default description");
  localized(spec.strategy.primaryCta?.label, "strategy.primaryCta.label", "The main call to action");

  spec.pages.forEach((page, p) => {
    const pageName = pageLabel(spec, page, p);
    localized(page.title, `pages.${p}.title`, `${pageName}: the page title`);
    localized(page.seo.title, `pages.${p}.seo.title`, `${pageName}: the search title`);
    localized(page.seo.description, `pages.${p}.seo.description`, `${pageName}: the search description`);
    page.sections.forEach((section, s) => {
      const path = `pages.${p}.sections.${s}`;
      const where = `${pageName} › ${SECTION_LABELS[section.kind].label}`;
      const values = section as unknown as Record<string, unknown>;
      for (const field of SECTION_FIELDS[section.kind]) {
        if (field.type === "text" || field.type === "longText") localized(values[field.key] as LocalizedText | undefined, `${path}.${field.key}`, `${where}: ${field.label.toLowerCase()}`);
      }
      const button = (values.button as { label: LocalizedText } | undefined)?.label;
      localized(button, `${path}.button.label`, `${where}: the button`);
      ((values.buttons as { label: LocalizedText }[] | undefined) ?? []).forEach((b, i) => localized(b.label, `${path}.buttons.${i}.label`, `${where}: a button`));
      ((values.items as Record<string, unknown>[] | undefined) ?? []).forEach((item, i) => {
        for (const field of ITEM_FIELDS[section.kind] ?? []) {
          const itemPath = `${path}.items.${i}.${field.key}`;
          const name = `${where}: ${field.label.toLowerCase()}`;
          if (field.type === "plain") {
            const text = (item[field.key] as string | undefined)?.trim();
            if (text) found.push({ path: itemPath, name, locale: null, text });
          } else if (field.type === "text" || field.type === "longText") localized(item[field.key] as LocalizedText | undefined, itemPath, name);
        }
      });
    });
  });

  spec.assets.forEach((asset, a) => localized(asset.alt, `assets.${a}.alt`, `${asset.description.trim() || `Image ${a + 1}`}: the alternative text`));
  spec.forms.forEach((form, f) => localized(form.consentText, `forms.${f}.consentText`, "A form's consent text"));
  return found;
}
