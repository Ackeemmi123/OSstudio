/**
 * The render model: one page of a SiteSpec, in one language, with everything
 * a renderer needs resolved. Menus are built and ordered, buttons point at
 * pages with their addresses, images and forms are looked up, and every
 * empty text says what is missing.
 *
 * It is platform-neutral and pure. The internal preview draws it; an
 * external renderer (Duda, a custom renderer) will map from it too.
 */
import {
  FORM_FIELD_LABELS,
  FORM_PURPOSE_LABELS,
  SECTION_LABELS,
  SITE_LOCALE_LABELS,
  type SectionKind,
  type SiteLocale,
} from "@/lib/site-spec/catalog";
import type { LocalizedText, SiteSpec, SiteSpecButton, SiteSpecPage, SiteSpecSection } from "@/lib/site-spec/schema";

export interface RenderOptions {
  /** The page to render. Unknown or absent: the home page. */
  pageId?: string;
  /** The language. Not one of the site's languages, or absent: the default. */
  locale?: string;
  /** Mark empty texts and placeholder images visibly, for drafts. */
  showMissing: boolean;
}

/** A text in the chosen language. `missing` names what is empty, when missing texts are shown. */
export interface RenderText {
  text: string;
  missing: string | null;
}

export interface RenderLink {
  label: RenderText;
  pageId: string;
  href: string;
}

export interface RenderNavItem {
  pageId: string;
  label: RenderText;
  href: string;
  current: boolean;
  children: RenderNavItem[];
}

export interface RenderImage {
  id: string;
  /** Empty when the alternative text is missing in this language. */
  alt: string;
  description: string;
  placeholder: boolean;
  missing: string | null;
}

export interface RenderItem {
  id: string;
  title: RenderText | null;
  body: RenderText | null;
  /** Who said a quote. Plain text, not translated. */
  meta: string | null;
  image: RenderImage | null;
}

export interface RenderForm {
  id: string;
  purpose: string;
  fields: { name: string; label: string }[];
  consent: RenderText;
}

export interface RenderSection {
  id: string;
  kind: SectionKind;
  /** "Hero", "Services", …, for labels and missing-text markers. */
  label: string;
  variant: string;
  mobile: string | null;
  heading: RenderText | null;
  subheading: RenderText | null;
  body: RenderText | null;
  buttons: RenderLink[];
  image: RenderImage | null;
  images: RenderImage[];
  items: RenderItem[];
  form: RenderForm | null;
}

export interface RenderPage {
  lang: SiteLocale;
  locales: { locale: SiteLocale; label: string; current: boolean }[];
  siteName: RenderText;
  page: { id: string; title: RenderText; seoTitle: RenderText; seoDescription: RenderText; noindex: boolean; href: string };
  mainNav: RenderNavItem[];
  footerNav: RenderNavItem[];
  primaryCta: RenderLink | null;
  sections: RenderSection[];
  /** Every page, in sitemap order, for a page picker. */
  pages: { id: string; title: string; href: string; depth: number }[];
  /** How many texts and images are missing on this page, counted whether or not they are shown. */
  missingCount: number;
}

/** The website address of a page in one language: "/" for home, "/fi/…" for other languages than the default. */
export function pageHref(spec: SiteSpec, page: SiteSpecPage, locale: SiteLocale): string {
  const prefix = locale === spec.locales.default ? "" : `/${locale}`;
  const parent = page.parentId ? spec.pages.find((p) => p.id === page.parentId) : undefined;
  const parts = [parent?.slug[locale], page.slug[locale]].filter((part): part is string => Boolean(part));
  return `${prefix}/${parts.join("/")}`;
}

export function buildRenderModel(spec: SiteSpec, options: RenderOptions): RenderPage {
  const locale: SiteLocale = spec.locales.available.includes(options.locale as SiteLocale) ? (options.locale as SiteLocale) : spec.locales.default;
  const language = SITE_LOCALE_LABELS[locale];
  const current = spec.pages.find((p) => p.id === options.pageId) ?? spec.pages[0];
  let missingCount = 0;

  const text = (value: LocalizedText | undefined, what: string): RenderText => {
    const found = value?.[locale]?.trim() ?? "";
    if (found) return { text: found, missing: null };
    missingCount++;
    return { text: "", missing: options.showMissing ? `${what} (${language})` : null };
  };
  const plain = (value: string | undefined, what: string): RenderText => {
    const found = value?.trim() ?? "";
    if (found) return { text: found, missing: null };
    missingCount++;
    return { text: "", missing: options.showMissing ? what : null };
  };
  /** A text that may be left empty: no marker, not counted. */
  const optional = (value: LocalizedText | undefined): RenderText | null => {
    const found = value?.[locale]?.trim();
    return found ? { text: found, missing: null } : null;
  };

  const pageTitle = (page: SiteSpecPage) => page.title[locale]?.trim() || page.title[spec.locales.default]?.trim() || page.id;
  const link = (button: SiteSpecButton, what: string): RenderLink => {
    const target = spec.pages.find((p) => p.id === button.targetPageId) ?? spec.pages[0];
    return { label: text(button.label, what), pageId: target.id, href: pageHref(spec, target, locale) };
  };
  const image = (id: string | undefined): RenderImage | null => {
    const asset = id ? spec.assets.find((a) => a.id === id) : undefined;
    if (!asset) return null;
    const alt = asset.alt[locale]?.trim() ?? "";
    const placeholder = asset.origin === "placeholder";
    const missingParts = [placeholder ? "image file" : null, alt ? null : `alternative text (${language})`].filter(Boolean);
    if (missingParts.length) missingCount++;
    return {
      id: asset.id,
      alt,
      description: asset.description,
      placeholder,
      missing: options.showMissing && missingParts.length ? `${asset.description || "Image"}: ${missingParts.join(", ")}` : null,
    };
  };

  const nav = (placement: "main" | "footer"): RenderNavItem[] => {
    const item = (page: SiteSpecPage): RenderNavItem => ({
      pageId: page.id,
      label: { text: pageTitle(page), missing: null },
      href: pageHref(spec, page, locale),
      current: page.id === current.id,
      children: spec.pages.filter((child) => child.parentId === page.id && child.nav === placement).map(item),
    });
    return spec.pages.filter((page) => page.nav === placement && (page.parentId === undefined || spec.pages.find((p) => p.id === page.parentId)?.nav !== placement)).map(item);
  };

  const sections = current.sections.map((section): RenderSection => sectionModel(section));

  function sectionModel(section: SiteSpecSection): RenderSection {
    const label = SECTION_LABELS[section.kind].label;
    const base: RenderSection = {
      id: section.id,
      kind: section.kind,
      label,
      variant: section.variant,
      mobile: section.mobile ?? null,
      heading: null,
      subheading: null,
      body: null,
      buttons: [],
      image: null,
      images: [],
      items: [],
      form: null,
    };
    switch (section.kind) {
      case "hero":
        return { ...base, heading: text(section.heading, `${label}: heading`), subheading: optional(section.subheading), image: image(section.mediaAssetId), buttons: section.buttons.map((b) => link(b, `${label}: button label`)) };
      case "text":
        return { ...base, heading: optional(section.heading), body: text(section.body, `${label}: text`) };
      case "text_media":
        return { ...base, heading: optional(section.heading), body: text(section.body, `${label}: text`), image: image(section.mediaAssetId), buttons: section.buttons.map((b) => link(b, `${label}: button label`)) };
      case "features":
      case "services":
        return {
          ...base,
          heading: optional(section.heading),
          items: section.items.map((entry) => ({ id: entry.id, title: text(entry.title, `${label}: title`), body: optional(entry.body), meta: null, image: null })),
        };
      case "testimonials":
        return {
          ...base,
          heading: optional(section.heading),
          items: section.items.map((entry) => ({ id: entry.id, title: null, body: text(entry.quote, `${label}: quote`), meta: entry.author.trim() || null, image: null })),
        };
      case "team":
        return {
          ...base,
          heading: optional(section.heading),
          items: section.items.map((entry) => ({ id: entry.id, title: plain(entry.name, `${label}: name`), body: text(entry.role, `${label}: role`), meta: null, image: image(entry.assetId) })),
        };
      case "faq":
        return {
          ...base,
          heading: optional(section.heading),
          items: section.items.map((entry) => ({ id: entry.id, title: text(entry.question, `${label}: question`), body: text(entry.answer, `${label}: answer`), meta: null, image: null })),
        };
      case "gallery":
        return { ...base, heading: optional(section.heading), images: section.assetIds.map(image).filter((i): i is RenderImage => i !== null) };
      case "cta":
        return { ...base, heading: text(section.heading, `${label}: heading`), body: optional(section.body), buttons: [link(section.button, `${label}: button label`)] };
      case "contact": {
        const form = section.formId ? spec.forms.find((f) => f.id === section.formId) : undefined;
        return {
          ...base,
          heading: text(section.heading, `${label}: heading`),
          body: optional(section.body),
          form: form
            ? {
                id: form.id,
                purpose: FORM_PURPOSE_LABELS[form.purpose],
                fields: form.fields.map((name) => ({ name, label: FORM_FIELD_LABELS[name] })),
                consent: text(form.consentText, "Form: consent text"),
              }
            : null,
        };
      }
      case "map":
        return { ...base, heading: optional(section.heading) };
    }
  }

  const depthOf = (page: SiteSpecPage) => (page.parentId ? 1 : 0);
  return {
    lang: locale,
    locales: spec.locales.available.map((l) => ({ locale: l, label: SITE_LOCALE_LABELS[l], current: l === locale })),
    siteName: text(spec.seo.siteName, "Site name"),
    page: {
      id: current.id,
      title: text(current.title, "Page title"),
      seoTitle: current.seo.noindex ? optional(current.seo.title) ?? { text: "", missing: null } : text(current.seo.title, "Search title"),
      seoDescription: current.seo.noindex ? optional(current.seo.description) ?? { text: "", missing: null } : text(current.seo.description, "Search description"),
      noindex: current.seo.noindex,
      href: pageHref(spec, current, locale),
    },
    mainNav: nav("main"),
    footerNav: nav("footer"),
    primaryCta: spec.strategy.primaryCta ? link(spec.strategy.primaryCta, "Main call to action") : null,
    sections,
    pages: spec.pages.map((page) => ({ id: page.id, title: pageTitle(page), href: pageHref(spec, page, locale), depth: depthOf(page) })),
    missingCount,
  };
}
