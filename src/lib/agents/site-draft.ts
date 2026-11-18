/**
 * The website draft: Claude reads all of a client's material and proposes a
 * whole SiteSpec. This module holds what the model is given, the shape its
 * answer must have, and the checks that turn that answer into a spec.
 *
 * The model only proposes. Every text it writes must cite the material: a
 * quote that is found in a text source, or a page of a kept PDF or image.
 * A value without a source is dropped, except short generic labels such as
 * "Kontakt", which the model must mark as generic. Every page, section and
 * item carries a proposal source, so the spec cannot be approved until a
 * person has looked at it (approvalBlockers in site-spec/validate.ts).
 */
import { z } from "zod";
import type { ProjectType, ProposalTarget } from "@/lib/domain/types";
import { ACCESSIBILITY_TARGET, DESIGN_SYSTEMS, FORM_FIELDS, ITEM_LIMITS, NAV_PLACEMENTS, SECTION_VARIANTS, SITE_LOCALES, type SectionKind, type SiteLocale } from "@/lib/site-spec/catalog";
import { SITE_SPEC_VERSION, siteSpecSchema, type SiteSpec, type SiteSpecPage, type SiteSpecSection, type SiteSpecSource } from "@/lib/site-spec/schema";
import { containsQuote, type IntakeSource } from "./intake";
import { utf8Bytes } from "./pricing";

export const SITE_DRAFT_LIMITS = {
  pages: 12,
  sectionsPerPage: 12,
  files: 10,
  /** Pages of all PDFs together. A PDF page costs about 1,500–3,000 tokens. */
  pdfPages: 100,
  minQuoteLength: 3,
  maxQuoteLength: 600,
  /** A value without a source is kept only when the model marks it generic and it is this short. */
  maxGenericLength: 60,
  maxQuestions: 15,
  maxDropped: 50,
} as const;

/** A kept PDF or image, sent to the model as it is. */
export interface DraftFile {
  id: string;
  title: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
  sha256: string;
  /** Base64 of the file. */
  data: string;
  /** PDF pages, counted from the file. */
  pages: number;
}

export interface SiteDraftInput {
  client: { name: string; contactPerson: string | null; website: string | null };
  projectType: ProjectType;
  /** Brief values. Each counts as a text source the model may cite (`brief-<target>`). */
  brief: { target: ProposalTarget; value: string; confidence: string }[];
  /** Text sources: first-contact notes, pasted text, Word documents and web pages. */
  sources: IntakeSource[];
  files: DraftFile[];
}

/* -------------------------------------------------------------------------- */
/* What the model must answer                                                 */
/* -------------------------------------------------------------------------- */

const ref = z.object({
  sourceId: z.string().describe("The id of the source, exactly as given."),
  quote: z.string().describe("Words copied exactly from that source that support the text. For a PDF or image, the words as they appear on it."),
  page: z.number().int().nullable().describe("The PDF page the quote is on, from 1. Null for other sources."),
});

const value = z.object({
  text: z.string().describe("The text for the website, in the site's language. Empty when the material does not give it."),
  refs: z.array(ref).describe("Where the text comes from. Required for every text that states a fact."),
  generic: z.boolean().describe("True only for a short generic label that states no fact, such as a menu name or 'Kontakt'."),
});

const item = z.object({
  title: value.describe("Item title. For team: the person's name. For faq: the question."),
  body: value.describe("Item text. For faq: the answer. For testimonials: the quote."),
  extra: value.describe("For services: the price. For team: the role. For testimonials: the author. For an event: when it is. Otherwise empty."),
});

const section = z.object({
  kind: z.enum(Object.keys(SECTION_VARIANTS) as [SectionKind, ...SectionKind[]]),
  variant: z.string().describe("One of the variants listed for this kind."),
  eyebrow: value,
  heading: value,
  subheading: value.describe("Hero only. Otherwise empty."),
  body: value.describe("For text, text_media, cta and contact. Otherwise empty."),
  items: z.array(item).describe("For features, services, team, faq and testimonials. Otherwise empty."),
  button: z.object({ label: value, targetPageId: z.string() }).nullable(),
});

const page = z.object({
  id: z.string().describe("Lower-case id, letters, digits and hyphens, e.g. 'om-oss'. The first page is the home page."),
  title: value,
  slug: z.string().describe("The page's address, lower-case with hyphens. Empty for the home page."),
  nav: z.enum(NAV_PLACEMENTS),
  seoDescription: value,
  sections: z.array(section),
});

export const siteDraftModelOutput = z.object({
  designSystem: z.enum(DESIGN_SYSTEMS).describe("association@0.1 for associations, clubs and societies; template otherwise."),
  language: z.enum(SITE_LOCALES).describe("The language the client's material and website are in."),
  siteName: value,
  siteDescription: value,
  goal: value.describe("What the website must achieve, from the material."),
  tone: z.string().describe("How the texts should sound, in a few words, judged from the client's own writing."),
  audiences: z.array(value),
  primaryCta: z.object({ label: value, targetPageId: z.string() }).nullable(),
  colors: z.object({
    primary: z.string().describe("Hex colour like #1A2B3C, from the logo or the client's material. Empty when unknown."),
    accent: z.string().describe("Hex colour or empty."),
    basis: z.string().describe("Where the colours come from, e.g. 'the red in the logo'. Empty when unknown."),
  }),
  contactFormFields: z.array(z.enum(FORM_FIELDS)).describe("Fields for the contact form, when the site has one."),
  pages: z.array(page),
  summary: z.string().describe("Two to five sentences for the person who reviews the draft: what the site is and what is missing."),
  questions: z.array(z.string()).describe("Questions to ask the client where the material is thin or contradicts itself."),
});
export type SiteDraftModelOutput = z.infer<typeof siteDraftModelOutput>;

/* -------------------------------------------------------------------------- */
/* What is stored on the run                                                  */
/* -------------------------------------------------------------------------- */

export interface DraftRef {
  sourceId: string;
  sourceLabel: string;
  quote: string;
  page: number | null;
  /** True when the quote was found in the source text. PDFs and images cannot be checked here. */
  checked: boolean;
}

export interface SiteDraftResult {
  kind: "site_draft";
  projectId: string;
  spec: SiteSpec;
  /** For every non-empty text in the spec, by path (e.g. "pages.0.sections.1.heading"): its sources, or "generic". */
  provenance: Record<string, DraftRef[] | "generic">;
  summary: string;
  questions: string[];
  /** Texts left out because no source supported them. */
  dropped: { path: string; text: string }[];
  analyzedSources: { id: string; label: string; kind: "text" | "pdf" | "image"; size: number }[];
  /** Files not sent to the model, and why. */
  skippedFiles: { id: string; title: string; reason: string }[];
  externalResearch: false;
}

/* -------------------------------------------------------------------------- */
/* Checks                                                                      */
/* -------------------------------------------------------------------------- */

export function briefSourceId(target: string) {
  return `brief-${target}`;
}

/** The text sources the model may quote: the brief values and the client's text material. */
export function textSources(input: SiteDraftInput): IntakeSource[] {
  return [
    ...input.brief.map((entry) => ({ id: briefSourceId(entry.target), label: `Brief: ${entry.target}`, type: "manual" as const, content: entry.value })),
    ...input.sources,
  ];
}

export function checkSiteDraftInput(input: SiteDraftInput): { ok: true } | { ok: false; blocker: string } {
  const characters = input.sources.reduce((sum, source) => sum + source.content.trim().length, 0);
  if (characters < 200 && input.files.length === 0) {
    return { ok: false, blocker: "There is too little material to draft a website from. Add the client's texts, files or current web page under Source material first." };
  }
  return { ok: true };
}

const DEFAULT_COLORS = { primary: "#1F4E79", background: "#FFFFFF", text: "#1A1A1A", neutral: ["#F4F4F4", "#D9D9D9", "#737373"] };
const hex = (raw: string) => (/^#[0-9a-fA-F]{6}$/.test(raw.trim()) ? raw.trim().toUpperCase() : null);

export function slugify(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

function pageIdOf(raw: string, fallback: string, used: Set<string>): string {
  let id = slugify(raw) || fallback;
  if (!/^[a-z]/.test(id)) id = `p-${id}`;
  id = id.slice(0, 50);
  let unique = id;
  for (let n = 2; used.has(unique); n++) unique = `${id}-${n}`;
  used.add(unique);
  return unique;
}

/**
 * Turns the model's answer into a SiteSpec and its provenance, keeping only
 * what the material supports. Throws when the answer has the wrong shape or
 * the result is not a valid spec.
 */
export function normalizeSiteDraft(raw: unknown, input: SiteDraftInput, context: { runId: string; projectId: string }): SiteDraftResult {
  const output = siteDraftModelOutput.parse(raw);
  const texts = new Map(textSources(input).map((source) => [source.id, source]));
  const files = new Map(input.files.map((file) => [file.id, file]));
  const provenance: SiteDraftResult["provenance"] = {};
  const dropped: SiteDraftResult["dropped"] = [];
  const locale: SiteLocale = output.language;
  const proposal = (part: string): SiteSpecSource => ({ kind: "proposal", runId: context.runId.slice(0, 80), proposalId: part.slice(0, 80) });

  /** The value's text when the material supports it; "" otherwise. Records where it came from. */
  const take = (v: z.infer<typeof value>, path: string, max: number): string => {
    const text = v.text.trim();
    if (!text) return "";
    if (text.length > max) {
      drop(path, text);
      return "";
    }
    const refs: DraftRef[] = [];
    for (const r of v.refs.slice(0, 5)) {
      const quote = r.quote.trim();
      if (quote.length < SITE_DRAFT_LIMITS.minQuoteLength || quote.length > SITE_DRAFT_LIMITS.maxQuoteLength) continue;
      const source = texts.get(r.sourceId);
      if (source) {
        if (containsQuote(source.content, quote)) refs.push({ sourceId: source.id, sourceLabel: source.label, quote, page: null, checked: true });
        continue;
      }
      const file = files.get(r.sourceId);
      if (file) {
        const page = file.mimeType === "application/pdf" && r.page && r.page >= 1 && r.page <= file.pages ? r.page : null;
        refs.push({ sourceId: file.id, sourceLabel: file.title, quote, page, checked: false });
      }
    }
    if (refs.length) {
      provenance[path] = refs;
      return text;
    }
    if (v.generic && text.length <= SITE_DRAFT_LIMITS.maxGenericLength) {
      provenance[path] = "generic";
      return text;
    }
    drop(path, text);
    return "";
  };
  function drop(path: string, text: string) {
    if (dropped.length < SITE_DRAFT_LIMITS.maxDropped) dropped.push({ path, text: text.length > 200 ? `${text.slice(0, 199)}…` : text });
  }
  const loc = (text: string) => ({ [locale]: text });

  // Page ids first, so buttons can only point at pages that exist.
  const used = new Set<string>();
  const modelPages = output.pages.slice(0, SITE_DRAFT_LIMITS.pages);
  const ids = modelPages.map((p, i) => (i === 0 ? (used.add("home"), "home") : pageIdOf(p.id || p.slug || p.title.text, `page-${i + 1}`, used)));
  const idFor = new Map(modelPages.map((p, i) => [p.id, ids[i]]));
  const target = (raw: string) => idFor.get(raw) ?? (ids.includes(raw) ? raw : null);

  let hasContact = false;
  const pages: SiteSpecPage[] = modelPages.map((p, pi) => {
    const pageId = ids[pi];
    const base = `pages.${pi}`;
    const slug = pi === 0 ? "" : slugify(p.slug) || slugify(p.title.text) || pageId;
    const title = take(p.title, `${base}.title`, 80);
    const sections: SiteSpecSection[] = [];
    for (const s of p.sections.slice(0, SITE_DRAFT_LIMITS.sectionsPerPage)) {
      const si = sections.length;
      const path = `${base}.sections.${si}`;
      const kind = s.kind;
      const variants = SECTION_VARIANTS[kind] as readonly string[];
      const variant = variants.includes(s.variant) ? s.variant : variants[0];
      const id = `${pageId}-${kind.replace("_", "-")}-${si + 1}`.slice(0, 64);
      const common = { id, kind, variant, source: proposal(`${pageId}/${si + 1}`) };
      const eyebrow = take(s.eyebrow, `${path}.eyebrow`, 60);
      const heading = take(s.heading, `${path}.heading`, 120);
      const withEyebrow = eyebrow ? { eyebrow: loc(eyebrow) } : {};
      const button = (b: typeof s.button, at: string) => {
        if (!b) return null;
        const to = target(b.targetPageId);
        const label = to ? take(b.label, at, 40) : "";
        return to && label ? { label: loc(label), targetPageId: to } : null;
      };
      const items = (max: number) =>
        s.items.slice(0, max).map((it, ii) => ({
          id: `item-${ii + 1}`,
          source: proposal(`${pageId}/${si + 1}/${ii + 1}`),
          title: take(it.title, `${path}.items.${ii}.title`, 80),
          body: take(it.body, `${path}.items.${ii}.body`, 1000),
          extra: take(it.extra, `${path}.items.${ii}.extra`, 80),
        }));
      switch (kind) {
        case "hero": {
          const b = button(s.button, `${path}.button.label`);
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), subheading: loc(take(s.subheading, `${path}.subheading`, 300)), buttons: b ? [b] : [] } as SiteSpecSection);
          break;
        }
        case "text":
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), body: loc(take(s.body, `${path}.body`, 4000)) } as SiteSpecSection);
          break;
        case "text_media": {
          const b = button(s.button, `${path}.button.label`);
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), body: loc(take(s.body, `${path}.body`, 4000)), buttons: b ? [b] : [] } as SiteSpecSection);
          break;
        }
        case "features":
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), items: items(ITEM_LIMITS.features!).map((it) => ({ id: it.id, source: it.source, title: loc(it.title), body: loc(joinLines(it.extra, it.body).slice(0, 400)) })) } as SiteSpecSection);
          break;
        case "services":
        case "products":
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), items: items(ITEM_LIMITS[kind]!).map((it) => ({ id: it.id, source: it.source, title: loc(it.title), body: loc(it.body), ...(it.extra ? { price: loc(it.extra.slice(0, 60)) } : {}) })) } as SiteSpecSection);
          break;
        case "testimonials":
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), items: items(ITEM_LIMITS.testimonials!).filter((it) => it.body && it.extra).map((it) => ({ id: it.id, source: it.source, quote: loc(it.body.slice(0, 600)), author: it.extra })) } as SiteSpecSection);
          break;
        case "team":
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), items: items(ITEM_LIMITS.team!).filter((it) => it.title).map((it) => ({ id: it.id, source: it.source, name: it.title, role: loc(it.extra) })) } as SiteSpecSection);
          break;
        case "faq":
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), items: items(ITEM_LIMITS.faq!).map((it) => ({ id: it.id, source: it.source, question: loc(it.title.slice(0, 200)), answer: loc(it.body) })) } as SiteSpecSection);
          break;
        case "gallery":
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), assetIds: [] } as SiteSpecSection);
          break;
        case "cta": {
          const b = button(s.button, `${path}.button.label`);
          if (!b) {
            sections.push({ ...common, kind: "text", variant: "single_column", ...withEyebrow, heading: loc(heading), body: loc(take(s.body, `${path}.body`, 300)) } as SiteSpecSection);
            break;
          }
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), body: loc(take(s.body, `${path}.body`, 300)), button: b } as SiteSpecSection);
          break;
        }
        case "contact":
          hasContact = true;
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading), body: loc(take(s.body, `${path}.body`, 600)), formId: "contact-form" } as SiteSpecSection);
          break;
        case "map":
          sections.push({ ...common, kind, variant, ...withEyebrow, heading: loc(heading) } as SiteSpecSection);
          break;
      }
    }
    return {
      id: pageId,
      slug: { [locale]: slug },
      title: loc(title),
      nav: p.nav,
      seo: { title: loc(title.slice(0, 60)), description: loc(take(p.seoDescription, `${base}.seoDescription`, 160)), noindex: false },
      sections,
    };
  });
  if (pages.length === 0) throw new Error("The draft has no pages.");

  // Item texts were taken under their own paths; paths of texts that were merged or cut are kept as they are.
  const goal = take(output.goal, "strategy.goal", 1000);
  const audiences = output.audiences.slice(0, 5).flatMap((a, i) => {
    const text = take(a, `strategy.audiences.${i}`, 300);
    return text ? [{ id: `audience-${i + 1}`, text, source: proposal(`audience-${i + 1}`) }] : [];
  });
  const ctaTarget = output.primaryCta ? target(output.primaryCta.targetPageId) : null;
  const ctaLabel = output.primaryCta && ctaTarget ? take(output.primaryCta.label, "strategy.primaryCta.label", 40) : "";
  const primary = hex(output.colors.primary);
  const accent = hex(output.colors.accent);

  const spec: SiteSpec = {
    specVersion: SITE_SPEC_VERSION,
    locales: { available: [locale], default: locale },
    strategy: {
      goal: goal ? { text: goal, source: proposal("goal") } : { text: "" },
      audiences,
      ...(ctaLabel && ctaTarget ? { primaryCta: { label: loc(ctaLabel), targetPageId: ctaTarget } } : {}),
      tone: output.tone.trim().slice(0, 200),
    },
    brand: {
      colors: { ...DEFAULT_COLORS, ...(primary ? { primary } : {}), ...(accent ? { accent } : {}) },
      typography: { heading: { family: "Inter", weight: 700 }, body: { family: "Inter", weight: 400 }, scale: "1.25" },
      radius: "soft",
      density: "regular",
      designSystem: output.designSystem,
      ...(primary ? { source: proposal("brand") } : {}),
    },
    assets: [],
    pages,
    forms: hasContact
      ? [{ id: "contact-form", purpose: "contact", fields: output.contactFormFields.length ? [...new Set(output.contactFormFields)] : ["name", "email", "message"], consentText: loc(""), recipient: "client_contact" }]
      : [],
    integrations: { analytics: { enabled: false }, maps: { enabled: false }, booking: { enabled: false }, newsletter: { enabled: false }, store: { enabled: false } },
    seo: {
      siteName: loc(take(output.siteName, "seo.siteName", 60) || input.client.name.slice(0, 60)),
      defaultDescription: loc(take(output.siteDescription, "seo.defaultDescription", 160)),
      structuredData: output.designSystem === "association@0.1" ? "Organization" : "LocalBusiness",
    },
    accessibility: { target: ACCESSIBILITY_TARGET },
  };
  if (!provenance["seo.siteName"]) provenance["seo.siteName"] = "generic";

  return {
    kind: "site_draft",
    projectId: context.projectId,
    spec: siteSpecSchema.parse(spec),
    provenance,
    summary: output.summary.trim().slice(0, 2000),
    questions: output.questions.map((q) => q.trim()).filter(Boolean).slice(0, SITE_DRAFT_LIMITS.maxQuestions).map((q) => q.slice(0, 500)),
    dropped,
    analyzedSources: [
      ...textSources(input).map((s) => ({ id: s.id, label: s.label, kind: "text" as const, size: s.content.length })),
      ...input.files.map((f) => ({ id: f.id, label: f.title, kind: f.mimeType === "application/pdf" ? ("pdf" as const) : ("image" as const), size: Math.floor((f.data.length * 3) / 4) })),
    ],
    skippedFiles: [],
    externalResearch: false,
  };
}

function joinLines(...parts: string[]) {
  return parts.filter(Boolean).join("\n");
}

/** Every non-empty text in a draft spec, by path, so a test can check that each has a source. An item's path ends in "." and covers its fields. */
export function draftTexts(spec: SiteSpec): { path: string; text: string }[] {
  const out: { path: string; text: string }[] = [];
  const first = (v: unknown) => (v && typeof v === "object" ? Object.values(v as Record<string, string>).find(Boolean) ?? "" : typeof v === "string" ? v : "");
  if (spec.strategy.goal.text) out.push({ path: "strategy.goal", text: spec.strategy.goal.text });
  spec.strategy.audiences.forEach((a, i) => out.push({ path: `strategy.audiences.${i}`, text: a.text }));
  spec.pages.forEach((page, pi) => {
    const base = `pages.${pi}`;
    if (first(page.title)) out.push({ path: `${base}.title`, text: first(page.title) });
    if (first(page.seo.description)) out.push({ path: `${base}.seoDescription`, text: first(page.seo.description) });
    page.sections.forEach((s, si) => {
      const path = `${base}.sections.${si}`;
      for (const key of ["eyebrow", "heading", "subheading", "body"] as const) {
        const text = first((s as Record<string, unknown>)[key]);
        if (text) out.push({ path: `${path}.${key}`, text });
      }
      // An item's texts are recorded under the item's original position (its id, item-<n>).
      for (const entry of ("items" in s ? s.items : []) as { id: string }[]) {
        const text = Object.entries(entry).filter(([key]) => key !== "id" && key !== "source").map(([, v]) => first(v)).filter(Boolean).join(" ");
        if (text) out.push({ path: `${path}.items.${Number(entry.id.slice(5)) - 1}.`, text });
      }
    });
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/* Size and identity                                                           */
/* -------------------------------------------------------------------------- */

/** An upper bound on the input tokens, counted as bytes (see worstCaseMicros). */
export function siteDraftRequestBytes(input: SiteDraftInput, promptBytes: number): number {
  const fileTokens = input.files.reduce((sum, file) => sum + (file.mimeType === "application/pdf" ? file.pages * 3_000 : 2_000), 0);
  return promptBytes + fileTokens;
}

/** PDF pages, counted from the page objects in the file. At least one. */
export function pdfPageCount(bytes: Uint8Array): number {
  const text = new TextDecoder("latin1").decode(bytes);
  return Math.max(1, (text.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length);
}

/** The same material and prompt give the same fingerprint, so asking again reuses the earlier draft. */
export async function siteDraftFingerprint(input: SiteDraftInput, promptVersion: string): Promise<string> {
  const material = JSON.stringify({
    promptVersion,
    projectType: input.projectType,
    client: input.client,
    brief: input.brief,
    sources: input.sources.map((s) => [s.id, s.content]),
    files: input.files.map((f) => [f.id, f.sha256]),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function siteDraftIdempotencyKey(projectId: string, fingerprint: string) {
  return `design.site_draft:${projectId}:${fingerprint}`;
}

export function textBytes(input: SiteDraftInput): number {
  return utf8Bytes(...textSources(input).map((s) => s.content));
}
