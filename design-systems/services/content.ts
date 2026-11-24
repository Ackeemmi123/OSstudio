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
    /** Opening hours line by line, as the firm writes them: the days, then the time (none when closed). */
    openingHours: z.array(z.strictObject({ days: words(60), time: words(60).optional() })).min(2).max(10).optional(),
    /** Where guests book: the firm's own booking service, an https address. */
    booking: z.strictObject({ href: z.url({ protocol: /^https$/ }) }).optional(),
  }),
  assets: z.array(asset).max(24),
  promise: z.strictObject({
    whoFor: statement(70),
    headline: statement(110),
    /** The end of the headline, where it turns. Must be how the headline ends. */
    turn: words(60).optional(),
    why: statement(280),
    action: z.strictObject({ label: words(36), by: z.enum(["form", "phone", "booking"]) }),
    secondAction: words(36).optional(),
    reassurance: statement(140).optional(),
    imageId: words(40).optional(),
  }),
  reasons: z.strictObject({ items: z.array(point).min(2).max(4) }),
  services: z.strictObject({
    label: words(60),
    heading: statement(110),
    items: z
      .array(
        z.strictObject({
          name: statement(60),
          text: statement(320),
          price: statement(50).optional(),
          /** Diet markings on a menu, as the place writes them: L, G, VEG. */
          diets: words(40).optional(),
          /** How long a treatment or appointment takes, as the place writes it: 60 min. */
          duration: words(30).optional(),
          /**
           * The service's own page, for firms whose areas each deserve one (a law firm's practice
           * areas): who it is for and the matters it typically covers, in the firm's own words.
           */
          page: z
            .strictObject({ slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60), whoFor: statement(240).optional(), matters: z.array(statement(200)).max(12), seo })
            .optional(),
        }),
      )
      .min(1)
      .max(8),
  }),
  firstSteps: z.strictObject({ label: words(60), heading: statement(110), items: z.array(point).min(2).max(4) }),
  proof: z.strictObject({
    quotes: z.array(z.strictObject({ text: statement(320), who: words(80), permission: z.enum(["given", "invented_test_data"]) })).max(4),
    credentials: z.array(statement(100)).max(6),
    imageId: words(40).optional(),
  }),
  questions: z.strictObject({ label: words(60), heading: statement(110), items: z.array(z.strictObject({ question: statement(140), answer: statement(500) })).min(1).max(12) }),
  closing: z.strictObject({ heading: statement(90), text: statement(200) }),
  /**
   * What makes this firm unlike others in its trade, from its own material. Each part is
   * optional; the design draws at most one of them (siteDesign.signature), and only when it is here.
   */
  signature: z
    .strictObject({
      /** The founding year and what happened since. */
      year: z.strictObject({ year: z.string().regex(/^\d{4}$/), heading: statement(110), events: z.array(z.strictObject({ when: words(12), text: statement(160) })).max(4) }).optional(),
      /** One sentence from the owner, in their own words. */
      ownerLine: z.strictObject({ text: statement(220), who: words(80), role: words(70).optional(), imageId: words(40).optional(), consent: z.enum(["given", "invented_test_data"]) }).optional(),
      /** An ordinary day, in the firm's own photos. */
      everyday: z.strictObject({ label: words(60), heading: statement(110), items: z.array(z.strictObject({ imageId: words(40), when: words(20).optional(), text: statement(140) })).min(3).max(5) }).optional(),
      /** The places the firm works in. */
      area: z.strictObject({ label: words(60), heading: statement(110), text: statement(240).optional(), places: z.array(z.strictObject({ name: words(40), note: statement(60).optional() })).min(2).max(8) }).optional(),
      /** Two or three numbers the client confirmed. */
      numbers: z.strictObject({ label: words(60), items: z.array(z.strictObject({ value: words(12), text: statement(80) })).min(2).max(3) }).optional(),
      /** The books the firm's people wrote: for experts whose authority is in print. */
      books: z
        .strictObject({
          label: words(60),
          heading: statement(110),
          items: z.array(z.strictObject({ title: statement(140), detail: statement(140), year: z.string().regex(/^\d{4}$/), href: z.url().optional() })).min(2).max(8),
          more: statement(200).optional(),
        })
        .optional(),
      /** What is on now: this season's dish, offer or opening. */
      season: z.strictObject({ label: words(40), title: statement(70), text: statement(200), price: statement(40).optional() }).optional(),
    })
    .optional(),
  /** The firm's own work in pictures, each with a line about it. Drawn only by directions that lead with images. */
  gallery: z
    .strictObject({ label: words(60), heading: statement(110), items: z.array(z.strictObject({ imageId: words(40), caption: statement(120) })).min(2).max(12) })
    .optional(),
  about: z.strictObject({
    slug: words(30),
    menuLabel: words(24),
    label: words(60),
    heading: statement(110),
    lead: statement(300),
    story: z.array(statement(800)).min(1).max(6),
    imageId: words(40).optional(),
    peopleLabel: words(60).optional(),
    people: z
      .array(
        z.strictObject({
          name: words(60),
          role: statement(70),
          imageId: words(40).optional(),
          consent: z.enum(["given", "invented_test_data"]),
          /** An expert's profile, as on a CV: their own words, education, positions of trust and languages. */
          profile: z
            .strictObject({
              bio: z.array(statement(800)).max(4),
              education: z.array(statement(200)).max(10),
              positions: z.array(statement(200)).max(16),
              languages: statement(160).optional(),
            })
            .optional(),
        }),
      )
      .max(12),
    seo,
  }),
  /** A page listing what the firm's people published or presented, for experts whose work is in print. */
  publications: z
    .strictObject({
      slug: words(30),
      menuLabel: words(24),
      label: words(60),
      heading: statement(110),
      lead: statement(300).optional(),
      groups: z.array(z.strictObject({ heading: words(80), items: z.array(z.strictObject({ text: statement(300), year: words(12).optional(), href: z.url().optional() })).min(1).max(120) })).min(1).max(8),
      seo,
    })
    .optional(),
  /** A restaurant's whole menu on its own page: groups (lunch, à la carte, drinks) of dishes with prices and diet markings. */
  menuPage: z
    .strictObject({
      slug: words(30),
      menuLabel: words(24),
      label: words(60),
      heading: statement(110),
      groups: z
        .array(
          z.strictObject({
            heading: words(80),
            text: statement(240).optional(),
            items: z.array(z.strictObject({ name: statement(80), text: statement(320).optional(), price: statement(50).optional(), diets: words(40).optional() })).min(1).max(40),
          }),
        )
        .min(1)
        .max(10),
      /** What the markings mean, and where to ask about allergens. */
      note: statement(600).optional(),
      seo,
    })
    .optional(),
  /** A portfolio: the projects page, and each project on its own page with its pictures, year, place and the firm's role. */
  projects: z
    .strictObject({
      slug: words(30),
      menuLabel: words(24),
      label: words(60),
      heading: statement(110),
      lead: statement(300).optional(),
      items: z
        .array(
          z.strictObject({
            slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(60),
            name: statement(80),
            year: words(12).optional(),
            place: words(80).optional(),
            role: statement(120).optional(),
            text: z.array(statement(800)).max(4),
            imageIds: z.array(words(40)).min(1).max(12),
            seo,
          }),
        )
        .min(1)
        .max(24),
      seo,
    })
    .optional(),
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
  direction: z.enum(["editorial", "formal", "statement", "cafe", "atelier", "clinic"]),
  palette: z.enum(["pine", "oxblood", "signal", "harbor", "dry", "measure", "brick", "verdigris", "ember", "cobalt", "gold", "navy", "timber", "plum", "hazard", "slate", "forest", "indigo", "steel", "terracotta", "teal", "ochre"]),
  /** Only the statement direction takes a type choice: its condensed face is the default. */
  type: z.enum(["wide", "grotesk"]).optional(),
  /** One recurring idea from the firm's own trade. Optional, and it adds nothing to what the page says. */
  motif: z.enum(["pipe", "drain", "scale", "ripple", "courses"]).optional(),
  /**
   * The concept: how this firm's site differs from others in the same direction.
   * hero: the photo beside the words (split, the direction's own), behind them (full) or left out (type).
   * signature: which part of content.signature to draw; it must be there.
   * feel: how photos are treated. motion: calm (the direction's own) or lively (more movement).
   */
  hero: z.enum(["split", "full", "type"]).optional(),
  signature: z.enum(["year", "ownerLine", "everyday", "area", "numbers", "season", "books"]).optional(),
  feel: z.enum(["natural", "warm", "mono", "grain"]).optional(),
  motion: z.enum(["calm", "lively"]).optional(),
});

export type SignatureKind = NonNullable<SiteDesign["signature"]>;

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
