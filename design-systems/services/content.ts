/**
 * What a services firm's website says, and nothing about how it looks. The
 * design system decides presentation, including whether something appears at
 * all: with no quotes there is no proof section and no empty slot. A test fails
 * if a layout, colour or section-type field appears here.
 */
import { z } from "zod";

/** Where a statement came from, so nothing on a page is of unknown origin. */
export const ORIGINS = ["brief", "ai_draft", "person", "client_confirmed"] as const;

const words = (max: number) => z.string().trim().min(1).max(max);

/** A sentence a visitor reads. A factual claim also says what confirms it. */
const statement = (max: number) => z.strictObject({ text: words(max), origin: z.enum(ORIGINS), evidence: words(200).optional() });

const asset = z.strictObject({
  id: words(40),
  /** A file in the site's folder, or for this proof a licensed stock image by address. */
  src: words(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: words(200),
  source: words(120),
  licence: words(120),
  /** Whether a person is recognisable, so consent can be asked for. */
  showsPerson: z.boolean(),
});

const seo = z.strictObject({ title: words(70), description: words(170) });

const point = z.strictObject({ title: statement(60), text: statement(240) });

export const siteContent = z.strictObject({
  /** Set by the proof's invented businesses. A site is either this or a concept. */
  invented: z.literal(true).optional(),
  /** An unrequested proposal for a real firm, from its public information only. Each page says so. */
  concept: z.strictObject({ preparedBy: words(60), sources: z.array(words(300)).min(1) }).optional(),
  /** A client's site under review in Studio OS: hidden from search, forms off, named as the agency's prototype. */
  prototype: z.strictObject({ madeBy: words(60) }).optional(),
  /** A paying client's real site, published only after this person approved it in writing. */
  client: z.strictObject({ approvedBy: words(80), approvedOn: words(10) }).optional(),
  language: z.enum(["en", "sv", "fi"]),
  business: z.strictObject({
    name: words(60),
    legalName: words(80).optional(),
    businessId: words(20).optional(),
    address: words(120).optional(),
    phone: words(30).optional(),
    email: z.email().optional(),
    hours: words(120).optional(),
  }),
  assets: z.array(asset).max(24),
  promise: z.strictObject({
    whoFor: statement(70),
    headline: statement(110),
    /** The end of the headline, where it turns. Must be how the headline ends. */
    turn: words(60).optional(),
    why: statement(280),
    action: z.strictObject({ label: words(36), by: z.enum(["form", "phone"]) }),
    secondAction: words(36).optional(),
    reassurance: statement(140).optional(),
    imageId: words(40).optional(),
  }),
  reasons: z.strictObject({ items: z.array(point).min(2).max(4) }),
  services: z.strictObject({
    label: words(60),
    heading: statement(110),
    items: z.array(z.strictObject({ name: statement(60), text: statement(320), price: statement(50).optional() })).min(1).max(8),
  }),
  firstSteps: z.strictObject({ label: words(60), heading: statement(110), items: z.array(point).min(2).max(4) }),
  proof: z.strictObject({
    quotes: z.array(z.strictObject({ text: statement(320), who: words(80), permission: z.enum(["given", "invented_test_data"]) })).max(4),
    credentials: z.array(statement(100)).max(6),
    imageId: words(40).optional(),
  }),
  questions: z.strictObject({ label: words(60), heading: statement(110), items: z.array(z.strictObject({ question: statement(140), answer: statement(500) })).min(1).max(12) }),
  closing: z.strictObject({ heading: statement(90), text: statement(200) }),
  about: z.strictObject({
    slug: words(30),
    menuLabel: words(24),
    label: words(60),
    heading: statement(110),
    lead: statement(300),
    story: z.array(statement(800)).min(1).max(6),
    imageId: words(40).optional(),
    peopleLabel: words(60).optional(),
    people: z.array(z.strictObject({ name: words(60), role: statement(70), imageId: words(40).optional(), consent: z.enum(["given", "invented_test_data"]) })).max(12),
    seo,
  }),
  contact: z.strictObject({ slug: words(30), menuLabel: words(24), heading: statement(110), text: statement(280), detailsLabel: words(40), seo }),
  form: z.strictObject({
    nameLabel: words(40),
    emailLabel: words(40),
    phoneLabel: words(40).optional(),
    messageLabel: words(60),
    send: words(36),
    whatHappensNext: statement(160),
    consent: statement(300),
  }),
  privacy: z.strictObject({ slug: words(30), menuLabel: words(24), heading: words(80), paragraphs: z.array(statement(800)).min(1).max(20), seo }),
  notFound: z.strictObject({ heading: words(80), text: words(200), back: words(40) }),
  menu: z.strictObject({ servicesLabel: words(24), questionsLabel: words(24) }),
  home: z.strictObject({ seo }),
}).refine((content) => [content.invented, content.concept, content.prototype, content.client].filter(Boolean).length === 1, { message: "A site must be exactly one of invented, a concept, a prototype, or a client's." });

export type SiteContent = z.infer<typeof siteContent>;
export type Asset = SiteContent["assets"][number];

/** The design choice, kept out of the content: which version, within a controlled range. */
export const siteDesign = z.strictObject({
  system: z.literal("services@0.1"),
  direction: z.enum(["editorial", "formal", "statement"]),
  palette: z.enum(["pine", "oxblood", "signal", "harbor", "dry", "measure", "brick", "verdigris", "ember", "cobalt", "gold", "navy", "timber", "plum", "hazard", "slate", "forest", "indigo", "steel", "terracotta", "teal", "ochre"]),
  /** Only the statement direction takes a type choice: its condensed face is the default. */
  type: z.enum(["wide", "grotesk"]).optional(),
  /** One recurring idea from the firm's own trade. Optional, and it adds nothing to what the page says. */
  motif: z.enum(["pipe", "drain", "scale", "ripple", "courses"]).optional(),
});

export type SiteDesign = z.infer<typeof siteDesign>;

export interface Site {
  content: SiteContent;
  design: SiteDesign;
  /** Where a published client site's form posts: an https address on Studio OS. Default /api/contact. */
  formAction?: string;
}

/** Every string a visitor could read, with the keys that are not visible left out. */
export function visibleStrings(content: SiteContent): string[] {
  const hidden = new Set(["id", "src", "source", "sources", "licence", "client", "origin", "evidence", "by", "permission", "consent_status", "language", "imageId", "slug"]);
  const found: string[] = [];
  const walk = (value: unknown, key: string) => {
    if (typeof value === "string") {
      if (!hidden.has(key) && !(key === "consent" && (value === "given" || value === "invented_test_data"))) found.push(value);
    } else if (Array.isArray(value)) value.forEach((entry) => walk(entry, key));
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  walk(content, "");
  return found;
}
