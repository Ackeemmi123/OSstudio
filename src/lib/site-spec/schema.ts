/**
 * SiteSpec v1: what a website should be, independent of the platform that
 * renders it. Studio OS owns it; a renderer (Duda, a custom renderer, a
 * person) builds from an approved version.
 *
 * The schema describes the content only. Which client and project it belongs
 * to, its version number, status and approvals are database columns (see
 * SiteSpecRecord), so the content can never contradict them.
 *
 * Drafts may be incomplete: texts may be empty. `approvalBlockers` in
 * validate.ts lists what must be filled in before a version can be approved.
 */
import { z } from "zod";
import { CONTEXT_FIELD_KEYS } from "@/lib/domain/types";
import {
  ACCESSIBILITY_TARGET,
  ASSET_KINDS,
  ASSET_ORIGINS,
  DENSITIES,
  FORM_FIELDS,
  FORM_PURPOSES,
  INTEGRATIONS,
  MOBILE_BEHAVIOURS,
  NAV_PLACEMENTS,
  RADII,
  SECTION_VARIANTS,
  SITE_LOCALES,
  SPEC_LIMITS,
  STRUCTURED_DATA_TYPES,
  TYPE_SCALES,
} from "./catalog";

export const SITE_SPEC_VERSION = 1;

/** Control characters and invisible bidi or zero-width characters. Multi-line text may keep newlines and tabs. */
function hasUnsafeCharacters(value: string, multiline: boolean): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (multiline && (ch === "\n" || ch === "\t")) continue;
    if (code < 0x20 || code === 0x7f || (code >= 0x200b && code <= 0x200f) || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) {
      return true;
    }
  }
  return false;
}

const text = (max: number, multiline = false) =>
  z.string().max(max, `Keep it under ${max} characters.`).refine((v) => !hasUnsafeCharacters(v, multiline), "Contains control characters.");

/** One text per website language. A missing or empty language is allowed in a draft. */
const localized = (max: number, multiline = false) =>
  z.strictObject({ en: text(max, multiline).optional(), sv: text(max, multiline).optional(), fi: text(max, multiline).optional() });

export const idSchema = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/, "Use lower-case letters, digits, - and _.");
const slug = z.string().regex(/^$|^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lower-case letters, digits and single hyphens.").max(80);
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1A2B3C.");
const fontFamily = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9 -]{0,59}$/, "Use a font family name, like Inter.");
const isoDate = z.iso.datetime({ offset: true });

/**
 * Where a piece of content came from. `brief` points at a brief value and
 * the moment it was confirmed: if the brief changes, the spec no longer
 * matches it and cannot be approved until a person looks again.
 */
export const sourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("brief"), field: z.enum(CONTEXT_FIELD_KEYS), confirmedAt: isoDate }),
  z.strictObject({ kind: z.literal("person"), by: text(120), at: isoDate }),
  /** An agent's proposal. Only counts once a person accepted it (`acceptedBy`). Not created in WF-1. */
  z.strictObject({ kind: z.literal("proposal"), runId: z.string().max(80), proposalId: z.string().max(80), acceptedBy: text(120).optional() }),
]);

const button = z.strictObject({ label: localized(40), targetPageId: idSchema });

const common = {
  id: idSchema,
  source: sourceSchema.optional(),
  /** A neutral hint for small screens; a renderer may follow it. */
  mobile: z.enum(MOBILE_BEHAVIOURS).optional(),
};

const section = <K extends keyof typeof SECTION_VARIANTS, S extends z.ZodRawShape>(kind: K, shape: S) =>
  z.strictObject({ ...common, kind: z.literal(kind), variant: z.enum(SECTION_VARIANTS[kind]), ...shape });

const item = <S extends z.ZodRawShape>(shape: S) => z.strictObject({ id: idSchema, source: sourceSchema.optional(), ...shape });

export const sectionSchema = z.discriminatedUnion("kind", [
  section("hero", { heading: localized(120), subheading: localized(300), mediaAssetId: idSchema.optional(), buttons: z.array(button).max(2) }),
  section("text", { heading: localized(120), body: localized(4000, true) }),
  section("text_media", { heading: localized(120), body: localized(4000, true), mediaAssetId: idSchema.optional(), buttons: z.array(button).max(1) }),
  section("features", { heading: localized(120), items: z.array(item({ title: localized(80), body: localized(400, true) })).max(12) }),
  section("services", { heading: localized(120), items: z.array(item({ title: localized(80), body: localized(1000, true) })).max(24) }),
  section("testimonials", { heading: localized(120), items: z.array(item({ quote: localized(600, true), author: text(80) })).max(12) }),
  section("gallery", { heading: localized(120), assetIds: z.array(idSchema).max(24) }),
  section("team", { heading: localized(120), items: z.array(item({ name: text(80), role: localized(80), assetId: idSchema.optional() })).max(24) }),
  section("faq", { heading: localized(120), items: z.array(item({ question: localized(200), answer: localized(1000, true) })).max(30) }),
  section("cta", { heading: localized(120), body: localized(300, true), button }),
  section("contact", { heading: localized(120), body: localized(600, true), formId: idSchema.optional() }),
  section("map", { heading: localized(120) }),
]);

export const pageSchema = z.strictObject({
  id: idSchema,
  /** Pages nest at most one level. */
  parentId: idSchema.optional(),
  /** The home page has an empty slug in every language. */
  slug: z.strictObject({ en: slug.optional(), sv: slug.optional(), fi: slug.optional() }),
  title: localized(80),
  nav: z.enum(NAV_PLACEMENTS),
  seo: z.strictObject({ title: localized(60), description: localized(160), noindex: z.boolean() }),
  sections: z.array(sectionSchema).max(SPEC_LIMITS.sectionsPerPage),
});

export const assetSchema = z.strictObject({
  id: idSchema,
  kind: z.enum(ASSET_KINDS),
  alt: localized(150),
  /** `placeholder`: no file yet, only a description of what is needed. */
  origin: z.enum(ASSET_ORIGINS),
  description: text(500, true),
  /** The stored image (site_assets) this asset shows. Only approved images of the same client can be approved in a spec. */
  fileId: z.uuid().optional(),
});

export const formSchema = z.strictObject({
  id: idSchema,
  purpose: z.enum(FORM_PURPOSES),
  fields: z.array(z.enum(FORM_FIELDS)).min(1).max(FORM_FIELDS.length),
  consentText: localized(300, true),
  /** Submissions go to the client's contact. A reference, never a typed address. */
  recipient: z.literal("client_contact"),
});

const integration = z.strictObject({ enabled: z.boolean(), note: text(300, true).optional() });

export const siteSpecSchema = z.strictObject({
  specVersion: z.literal(SITE_SPEC_VERSION),
  locales: z.strictObject({
    available: z.array(z.enum(SITE_LOCALES)).min(1).max(SITE_LOCALES.length),
    default: z.enum(SITE_LOCALES),
  }),
  strategy: z.strictObject({
    goal: z.strictObject({ text: text(1000, true), source: sourceSchema.optional() }),
    audiences: z.array(z.strictObject({ id: idSchema, text: text(300), source: sourceSchema.optional() })).max(SPEC_LIMITS.audiences),
    primaryCta: button.optional(),
    tone: text(200),
  }),
  brand: z.strictObject({
    colors: z.strictObject({
      primary: color,
      secondary: color.optional(),
      accent: color.optional(),
      background: color,
      text: color,
      neutral: z.array(color).max(SPEC_LIMITS.neutralColors),
    }),
    typography: z.strictObject({
      heading: z.strictObject({ family: fontFamily, weight: z.number().int().min(100).max(900).multipleOf(100) }),
      body: z.strictObject({ family: fontFamily, weight: z.number().int().min(100).max(900).multipleOf(100) }),
      scale: z.enum(TYPE_SCALES),
    }),
    radius: z.enum(RADII),
    density: z.enum(DENSITIES),
    logoAssetId: idSchema.optional(),
    /** Set when a person chose the brand. Absent: the starting defaults, which cannot be approved. */
    source: sourceSchema.optional(),
  }),
  assets: z.array(assetSchema).max(SPEC_LIMITS.assets),
  pages: z.array(pageSchema).min(1).max(SPEC_LIMITS.pages),
  forms: z.array(formSchema).max(SPEC_LIMITS.forms),
  integrations: z.strictObject(Object.fromEntries(INTEGRATIONS.map((key) => [key, integration])) as Record<(typeof INTEGRATIONS)[number], typeof integration>),
  seo: z.strictObject({
    siteName: localized(60),
    defaultDescription: localized(160),
    structuredData: z.enum(STRUCTURED_DATA_TYPES),
  }),
  accessibility: z.strictObject({ target: z.literal(ACCESSIBILITY_TARGET) }),
});

export type SiteSpec = z.infer<typeof siteSpecSchema>;
export type SiteSpecPage = z.infer<typeof pageSchema>;
export type SiteSpecSection = z.infer<typeof sectionSchema>;
export type SiteSpecAsset = z.infer<typeof assetSchema>;
export type SiteSpecForm = z.infer<typeof formSchema>;
export type SiteSpecSource = z.infer<typeof sourceSchema>;
export type LocalizedText = Partial<Record<(typeof SITE_LOCALES)[number], string>>;
export type SiteSpecButton = z.infer<typeof button>;
