/**
 * Checking a SiteSpec.
 *
 * - `parseSiteSpec` runs on every save: the shape (schema.ts) and the
 *   references between parts. A draft may be incomplete but never malformed.
 * - `approvalBlockers` lists what stops a version from being approved:
 *   missing texts, brief values that are not (or no longer) confirmed,
 *   proposals nobody accepted, placeholder images, poor contrast. The
 *   database repeats the brief check when a version is approved.
 */
import { CONTEXT_FIELD_LABELS } from "@/lib/domain/labels";
import type { Client, SiteAssetRecord } from "@/lib/domain/types";
import { SECTION_LABELS, SITE_LOCALE_LABELS, SITE_LOCALES, SPEC_LIMITS, type SiteLocale } from "./catalog";
import { siteSpecSchema, type LocalizedText, type SiteSpec, type SiteSpecButton, type SiteSpecPage, type SiteSpecSection } from "./schema";

export interface SpecIssue {
  /** Dot path into the spec, e.g. "pages.0.sections.1.heading.fi". */
  path: string;
  message: string;
}

export type ParsedSiteSpec = { ok: true; spec: SiteSpec } | { ok: false; issues: SpecIssue[] };

export function specByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** The shape and the references. Runs on every save. */
export function parseSiteSpec(value: unknown): ParsedSiteSpec {
  if (specByteLength(value) > SPEC_LIMITS.bytes) {
    return { ok: false, issues: [{ path: "", message: `The spec is larger than ${SPEC_LIMITS.bytes / 1024} KB.` }] };
  }
  const parsed = siteSpecSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })) };
  }
  const issues = referenceIssues(parsed.data);
  return issues.length ? { ok: false, issues } : { ok: true, spec: parsed.data };
}

function duplicates(ids: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const id of ids) (seen.has(id) ? repeated : seen).add(id);
  return [...repeated];
}

function buttonsOf(section: SiteSpecSection): SiteSpecButton[] {
  switch (section.kind) {
    case "hero":
    case "text_media":
      return section.buttons;
    case "cta":
      return [section.button];
    default:
      return [];
  }
}

function assetIdsOf(section: SiteSpecSection): string[] {
  switch (section.kind) {
    case "hero":
    case "text_media":
      return section.mediaAssetId ? [section.mediaAssetId] : [];
    case "gallery":
      return section.assetIds;
    case "team":
      return section.items.flatMap((member) => (member.assetId ? [member.assetId] : []));
    default:
      return [];
  }
}

function itemIdsOf(section: SiteSpecSection): string[] {
  return "items" in section ? section.items.map((i) => i.id) : [];
}

/** References between parts of a spec: ids, pages, assets, forms, slugs. */
export function referenceIssues(spec: SiteSpec): SpecIssue[] {
  const issues: SpecIssue[] = [];
  const pageIds = new Set(spec.pages.map((p) => p.id));
  const assetIds = new Set(spec.assets.map((a) => a.id));
  const formIds = new Set(spec.forms.map((f) => f.id));
  const sections = spec.pages.flatMap((page, p) => page.sections.map((section, s) => ({ section, path: `pages.${p}.sections.${s}` })));

  const groups: [string, string[]][] = [
    ["pages", spec.pages.map((p) => p.id)],
    ["sections", sections.map(({ section }) => section.id)],
    ["assets", spec.assets.map((a) => a.id)],
    ["forms", spec.forms.map((f) => f.id)],
    ["strategy.audiences", spec.strategy.audiences.map((a) => a.id)],
  ];
  for (const [path, ids] of groups) {
    for (const id of duplicates(ids)) issues.push({ path, message: `The id "${id}" is used twice.` });
  }
  for (const { section, path } of sections) {
    for (const id of duplicates(itemIdsOf(section))) issues.push({ path: `${path}.items`, message: `The id "${id}" is used twice.` });
  }

  if (duplicates(spec.locales.available).length) issues.push({ path: "locales.available", message: "A language is listed twice." });
  if (!spec.locales.available.includes(spec.locales.default)) {
    issues.push({ path: "locales.default", message: "The default language must be one of the website's languages." });
  }

  spec.pages.forEach((page, p) => {
    if (page.parentId !== undefined) {
      const parent = spec.pages.find((candidate) => candidate.id === page.parentId);
      if (!parent || parent.id === page.id) issues.push({ path: `pages.${p}.parentId`, message: "The parent page does not exist." });
      else if (parent.parentId !== undefined) issues.push({ path: `pages.${p}.parentId`, message: "Pages can be nested one level only." });
      else if (p === 0) issues.push({ path: `pages.${p}.parentId`, message: "The home page cannot have a parent." });
    }
    const slugs = Object.values(page.slug);
    if (p === 0 && slugs.some((value) => value !== "")) issues.push({ path: "pages.0.slug", message: "The first page is the home page; its address must be empty." });
    if (p > 0 && slugs.some((value) => value === "")) issues.push({ path: `pages.${p}.slug`, message: "Only the home page can have an empty address." });
  });

  for (const locale of SITE_LOCALES) {
    const paths = spec.pages.map((page) => pagePath(spec.pages, page, locale)).filter((path): path is string => path !== null);
    for (const path of duplicates(paths)) issues.push({ path: "pages", message: `Two pages have the address /${path} (${SITE_LOCALE_LABELS[locale]}).` });
  }

  const checkPage = (pageId: string, path: string) => {
    if (!pageIds.has(pageId)) issues.push({ path, message: "The button points to a page that does not exist." });
  };
  if (spec.strategy.primaryCta) checkPage(spec.strategy.primaryCta.targetPageId, "strategy.primaryCta.targetPageId");
  if (spec.brand.logoAssetId && !assetIds.has(spec.brand.logoAssetId)) issues.push({ path: "brand.logoAssetId", message: "The logo image does not exist." });

  for (const { section, path } of sections) {
    buttonsOf(section).forEach((b, i) => checkPage(b.targetPageId, section.kind === "cta" ? `${path}.button.targetPageId` : `${path}.buttons.${i}.targetPageId`));
    for (const id of assetIdsOf(section)) {
      if (!assetIds.has(id)) issues.push({ path, message: `The image "${id}" does not exist.` });
    }
    if (section.kind === "contact" && section.formId && !formIds.has(section.formId)) issues.push({ path: `${path}.formId`, message: "The form does not exist." });
  }

  spec.forms.forEach((form, f) => {
    if (duplicates(form.fields).length) issues.push({ path: `forms.${f}.fields`, message: "A field is listed twice." });
    if (!form.fields.includes("email") && !form.fields.includes("phone")) issues.push({ path: `forms.${f}.fields`, message: "A form needs an email or phone field to be answered." });
  });
  return issues;
}

/** A page's full address in one language, or null while a slug is missing. */
function pagePath(pages: SiteSpecPage[], page: SiteSpecPage, locale: SiteLocale): string | null {
  const own = page.slug[locale];
  if (own === undefined) return null;
  if (page.parentId === undefined) return own;
  const parent = pages.find((p) => p.id === page.parentId);
  const parentSlug = parent?.slug[locale];
  return parentSlug === undefined ? null : `${parentSlug}/${own}`;
}

/* -------------------------------------------------------------------------- */
/* Approval                                                                   */
/* -------------------------------------------------------------------------- */

export function contrastRatio(a: string, b: string): number {
  const luminance = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.2 AA: body text 4.5:1, interface elements and large text 3:1. */
export const CONTRAST_MINIMUM = { text: 4.5, interface: 3 } as const;

function pageName(spec: SiteSpec, page: SiteSpecPage, index: number): string {
  return page.title[spec.locales.default]?.trim() || page.title.en?.trim() || (index === 0 ? "Home page" : `Page ${index + 1}`);
}

/** What the spec's approval needs to know about a stored image. */
export type ImageFileStatus = Pick<SiteAssetRecord, "id" | "clientId" | "status">;

/**
 * What stops this version from being approved, in plain language. Empty
 * when it can be approved. `client` is the brief as it is now; `files` are
 * the client's stored images (an image the spec uses must be one of them,
 * with its rights approved).
 */
export function approvalBlockers(spec: SiteSpec, client: Pick<Client, "id" | "context">, files: readonly ImageFileStatus[] = []): SpecIssue[] {
  const blockers: SpecIssue[] = [];
  const locales = spec.locales.available;
  const require = (value: LocalizedText, path: string, what: string) => {
    for (const locale of locales) {
      if (!value[locale]?.trim()) blockers.push({ path: `${path}.${locale}`, message: `${what} is missing in ${SITE_LOCALE_LABELS[locale]}.` });
    }
  };

  if (!spec.strategy.goal.text.trim()) blockers.push({ path: "strategy.goal", message: "Write the website's goal." });
  if (!spec.strategy.audiences.some((a) => a.text.trim())) blockers.push({ path: "strategy.audiences", message: "Name at least one audience." });
  if (!spec.strategy.primaryCta) blockers.push({ path: "strategy.primaryCta", message: "Choose the main call to action." });
  else require(spec.strategy.primaryCta.label, "strategy.primaryCta.label", "The main call to action");
  if (!spec.brand.source) blockers.push({ path: "brand", message: "Choose the brand colours and fonts (the starting values are placeholders)." });

  const { colors } = spec.brand;
  if (contrastRatio(colors.text, colors.background) < CONTRAST_MINIMUM.text) {
    blockers.push({ path: "brand.colors.text", message: `Text on the background needs a contrast of at least ${CONTRAST_MINIMUM.text}:1.` });
  }
  if (contrastRatio(colors.primary, colors.background) < CONTRAST_MINIMUM.interface) {
    blockers.push({ path: "brand.colors.primary", message: `The primary colour on the background needs a contrast of at least ${CONTRAST_MINIMUM.interface}:1.` });
  }

  require(spec.seo.siteName, "seo.siteName", "The site name");
  require(spec.seo.defaultDescription, "seo.defaultDescription", "The default description");

  spec.pages.forEach((page, p) => {
    const name = pageName(spec, page, p);
    const base = `pages.${p}`;
    require(page.title, `${base}.title`, `${name}: the page title`);
    if (p > 0) {
      for (const locale of locales) {
        if (!page.slug[locale]) blockers.push({ path: `${base}.slug.${locale}`, message: `${name}: the address is missing in ${SITE_LOCALE_LABELS[locale]}.` });
      }
    }
    if (!page.seo.noindex) {
      require(page.seo.title, `${base}.seo.title`, `${name}: the search title`);
      require(page.seo.description, `${base}.seo.description`, `${name}: the search description`);
    }
    if (!page.sections.length) blockers.push({ path: `${base}.sections`, message: `${name} has no sections.` });
    page.sections.forEach((section, s) => sectionBlockers(section, `${base}.sections.${s}`, `${name} › ${SECTION_LABELS[section.kind].label}`, require, blockers));
  });

  spec.assets.forEach((asset, a) => {
    const name = asset.description.trim() || `Image ${a + 1}`;
    const path = `assets.${a}`;
    if (asset.origin === "placeholder" && !asset.fileId) {
      blockers.push({ path, message: `${name}: still a placeholder. Upload the image or choose one of the client's images.` });
    } else if (!asset.fileId) {
      blockers.push({ path, message: `${name}: has no image file. Upload the image or choose one of the client's images.` });
    } else {
      const file = files.find((f) => f.id === asset.fileId);
      if (!file || file.clientId !== client.id) blockers.push({ path, message: `${name}: the image file is not available for this client.` });
      else if (file.status === "deleted") blockers.push({ path, message: `${name}: the image was deleted. Choose another one.` });
      else if (file.status === "rejected") blockers.push({ path, message: `${name}: the rights for this image were rejected. Choose another one.` });
      else if (file.status !== "approved") blockers.push({ path, message: `${name}: the rights for this image are not approved yet.` });
    }
    require(asset.alt, `assets.${a}.alt`, `${name}: the alternative text`);
  });
  spec.forms.forEach((form, f) => require(form.consentText, `forms.${f}.consentText`, "A form's consent text"));

  for (const { source, path } of sources(spec)) {
    if (source.kind === "brief") {
      const field = client.context[source.field];
      const label = CONTEXT_FIELD_LABELS[source.field];
      if (field.confidence !== "confirmed") blockers.push({ path, message: `${label} is used from the brief but is not confirmed.` });
      else if (field.confirmedAt !== source.confirmedAt) blockers.push({ path, message: `${label} changed in the brief since it was used here. Check it again.` });
    } else if (source.kind === "proposal" && !source.acceptedBy) {
      blockers.push({ path, message: "A suggestion nobody has accepted is still in the spec." });
    }
  }
  return blockers;
}

type Require = (value: LocalizedText, path: string, what: string) => void;

function sectionBlockers(section: SiteSpecSection, path: string, name: string, require: Require, blockers: SpecIssue[]) {
  buttonsOf(section).forEach((b, i) => require(b.label, section.kind === "cta" ? `${path}.button.label` : `${path}.buttons.${i}.label`, `${name}: a button label`));
  switch (section.kind) {
    case "hero":
    case "cta":
    case "contact":
      require(section.heading, `${path}.heading`, `${name}: the heading`);
      break;
    case "text":
    case "text_media":
      require(section.body, `${path}.body`, `${name}: the text`);
      break;
    case "features":
    case "services":
      if (!section.items.length) blockers.push({ path: `${path}.items`, message: `${name}: add at least one item.` });
      section.items.forEach((entry, i) => require(entry.title, `${path}.items.${i}.title`, `${name}: an item's title`));
      break;
    case "testimonials":
      section.items.forEach((entry, i) => require(entry.quote, `${path}.items.${i}.quote`, `${name}: a quote`));
      break;
    case "faq":
      section.items.forEach((entry, i) => {
        require(entry.question, `${path}.items.${i}.question`, `${name}: a question`);
        require(entry.answer, `${path}.items.${i}.answer`, `${name}: an answer`);
      });
      break;
    case "team":
      section.items.forEach((entry, i) => require(entry.role, `${path}.items.${i}.role`, `${name}: a role`));
      break;
    case "gallery":
      if (!section.assetIds.length) blockers.push({ path: `${path}.assetIds`, message: `${name}: add at least one image.` });
      break;
    case "map":
      break;
  }
}

/** Every source in the spec, with its path. */
export function sources(spec: SiteSpec): { source: NonNullable<SiteSpec["brand"]["source"]>; path: string }[] {
  const found: { source: NonNullable<SiteSpec["brand"]["source"]>; path: string }[] = [];
  const visit = (value: unknown, path: string) => {
    if (Array.isArray(value)) value.forEach((entry, i) => visit(entry, path ? `${path}.${i}` : String(i)));
    else if (value && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) {
        const next = path ? `${path}.${key}` : key;
        if (key === "source" && entry && typeof entry === "object") found.push({ source: entry as never, path: next });
        else visit(entry, next);
      }
    }
  };
  visit(spec, "");
  return found;
}
