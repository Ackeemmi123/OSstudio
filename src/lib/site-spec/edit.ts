/**
 * Small, pure helpers for editing a SiteSpec draft: fresh ids, new pages,
 * sections, images and forms with every required field present, and
 * addresses made from titles.
 */
import type { Client, ContextFieldKey, SiteAssetRecord } from "@/lib/domain/types";
import { SECTION_VARIANTS, type SectionKind } from "./catalog";
import type { SiteSpec, SiteSpecAsset, SiteSpecForm, SiteSpecPage, SiteSpecSection, SiteSpecSource } from "./schema";

/** Every id already used in the spec, of any kind. */
export function usedIds(spec: SiteSpec): Set<string> {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (typeof record.id === "string") ids.add(record.id);
      Object.values(record).forEach(visit);
    }
  };
  visit(spec);
  return ids;
}

/** `prefix-1`, `prefix-2`, … : the first one not used yet. */
export function freshId(spec: SiteSpec, prefix: string): string {
  const ids = usedIds(spec);
  const base = slugify(prefix) || "item";
  for (let n = 1; ; n++) {
    const id = `${/^[a-z]/.test(base) ? base : `x-${base}`}-${n}`.slice(0, 64);
    if (!ids.has(id)) return id;
  }
}

/** A page address from a title: lower case, ASCII, single hyphens. "Café & Bakery" → "cafe-bakery". */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

export function newSection(spec: SiteSpec, kind: SectionKind): SiteSpecSection {
  const home = spec.pages[0].id;
  const content: Record<SectionKind, Record<string, unknown>> = {
    hero: { heading: {}, subheading: {}, buttons: [] },
    text: { heading: {}, body: {} },
    text_media: { heading: {}, body: {}, buttons: [] },
    features: { heading: {}, items: [] },
    services: { heading: {}, items: [] },
    testimonials: { heading: {}, items: [] },
    gallery: { heading: {}, assetIds: [] },
    team: { heading: {}, items: [] },
    faq: { heading: {}, items: [] },
    cta: { heading: {}, body: {}, button: { label: {}, targetPageId: home } },
    contact: spec.forms[0] ? { heading: {}, body: {}, formId: spec.forms[0].id } : { heading: {}, body: {} },
    map: { heading: {} },
  };
  return { id: freshId(spec, kind.replace("_", "-")), kind, variant: SECTION_VARIANTS[kind][0], ...content[kind] } as SiteSpecSection;
}

/** An empty item for a section that lists things. */
export function newItem(spec: SiteSpec, kind: SectionKind): Record<string, unknown> {
  const id = freshId(spec, "item");
  switch (kind) {
    case "features":
    case "services":
      return { id, title: {}, body: {} };
    case "testimonials":
      return { id, quote: {}, author: "" };
    case "team":
      return { id, name: "", role: {} };
    case "faq":
      return { id, question: {}, answer: {} };
    default:
      return { id };
  }
}

export function newPage(spec: SiteSpec, title: string): SiteSpecPage {
  const slug = slugify(title) || "page";
  const taken = new Set(spec.pages.map((p) => p.slug[spec.locales.default]));
  let address = slug;
  for (let n = 2; taken.has(address); n++) address = `${slug}-${n}`;
  const locale = spec.locales.default;
  return {
    id: freshId(spec, slug),
    slug: { [locale]: address },
    title: { [locale]: title },
    nav: "main",
    seo: { title: { [locale]: title.slice(0, 60) }, description: {}, noindex: false },
    sections: [],
  };
}

/** Images are placeholders until asset storage exists (WF-2): a description of what is needed. */
export function newPlaceholderImage(spec: SiteSpec, description: string): SiteSpecAsset {
  return { id: freshId(spec, "image"), kind: "photo", alt: {}, origin: "placeholder", description };
}

export function newForm(spec: SiteSpec): SiteSpecForm {
  return { id: freshId(spec, "form"), purpose: "contact", fields: ["name", "email", "message"], consentText: {}, recipient: "client_contact" };
}

/** Moves an entry one place up (-1) or down (+1). Returns a new array. */
export function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/**
 * Replaces content copied from the brief with the brief's current value,
 * where a brief value was confirmed again (with a new value or not) after
 * the spec used it. Studio OS knows where such content lives: the goal, an
 * audience, or a text section's body, as the first draft put them there.
 * A text section keeps the default language only, so translations are
 * written again for the new wording. Other content is left alone and stays
 * a blocker until a person looks at it.
 */
export function refreshFromBrief(spec: SiteSpec, client: Pick<Client, "context">): { spec: SiteSpec; refreshed: ContextFieldKey[] } {
  const next = structuredClone(spec);
  const refreshed = new Set<ContextFieldKey>();
  const current = (source: SiteSpecSource | undefined) => {
    if (source?.kind !== "brief") return null;
    const field = client.context[source.field];
    if (field.confidence !== "confirmed" || !field.value?.trim() || !field.confirmedAt || field.confirmedAt === source.confirmedAt) return null;
    return { value: field.value.trim(), source: { kind: "brief" as const, field: source.field, confirmedAt: field.confirmedAt } };
  };

  const goal = current(next.strategy.goal.source);
  if (goal) {
    next.strategy.goal = { text: goal.value.slice(0, 1000), source: goal.source };
    refreshed.add(goal.source.field);
  }
  next.strategy.audiences = next.strategy.audiences.map((audience) => {
    const latest = current(audience.source);
    if (!latest) return audience;
    refreshed.add(latest.source.field);
    return { id: audience.id, text: latest.value.slice(0, 300), source: latest.source };
  });
  for (const page of next.pages) {
    page.sections = page.sections.map((section) => {
      const latest = section.kind === "text" ? current(section.source) : null;
      if (!latest || section.kind !== "text") return section;
      refreshed.add(latest.source.field);
      return { ...section, body: { [next.locales.default]: latest.value.slice(0, 4000) }, source: latest.source };
    });
  }
  return { spec: next, refreshed: [...refreshed] };
}

/** The SiteSpec origin for a stored image, from who holds its rights. */
export function originFor(file: Pick<SiteAssetRecord, "rightsBasis">): SiteSpecAsset["origin"] {
  if (file.rightsBasis === "studio_created") return "studio_photo";
  if (file.rightsBasis === "licensed" || file.rightsBasis === "other") return "licensed";
  return "client_supplied";
}

/** Shows a stored image in an existing image entry (replacing a placeholder). Keeps the alternative texts. */
export function attachFile(spec: SiteSpec, assetId: string, file: Pick<SiteAssetRecord, "id" | "description" | "rightsBasis">): void {
  const asset = spec.assets.find((a) => a.id === assetId);
  if (!asset) return;
  asset.fileId = file.id;
  asset.origin = originFor(file);
  if (!asset.description.trim()) asset.description = file.description.slice(0, 500);
}

/** A new image entry showing a stored image. Alternative texts are written by a person. */
export function newImageFromFile(spec: SiteSpec, file: Pick<SiteAssetRecord, "id" | "description" | "rightsBasis">): SiteSpecAsset {
  return { id: freshId(spec, "image"), kind: "photo", alt: {}, origin: originFor(file), description: file.description.slice(0, 500), fileId: file.id };
}
