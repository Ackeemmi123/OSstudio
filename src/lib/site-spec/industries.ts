/**
 * What kind of business a website is for, and what that means for it: which of
 * the company design's styles suit it, what each part of the design holds, how
 * the texts should sound and what they must never say. The AI draft follows
 * the profile; a person can change it in the spec.
 */
import { SERVICES_DIRECTIONS, SERVICES_MOTIFS, SERVICES_PALETTES } from "./catalog";

export const INDUSTRIES = ["law_finance", "consulting", "trades", "interior_design", "cafe_restaurant", "health_beauty", "retail", "other"] as const;
export type Industry = (typeof INDUSTRIES)[number];

type Direction = (typeof SERVICES_DIRECTIONS)[number];
type Palette = (typeof SERVICES_PALETTES)[number];
type Motif = (typeof SERVICES_MOTIFS)[number];
type Style = { direction: Direction; palette: Palette; type?: "wide" | "grotesk"; motif?: Motif };

export interface IndustryProfile {
  label: string;
  /** Recognised from the material, for the AI draft. */
  examples: string;
  directions: readonly Direction[];
  palettes: readonly Palette[];
  motifs: readonly Motif[];
  /** Three distinct starting styles, used when the AI draft proposed none that fit. */
  defaults: readonly [Style, Style, Style];
  /** How the texts sound. */
  tone: string;
  /** What each part of the company design holds for this kind of business. */
  parts: { reasons: string; services: string; firstSteps: string; proof: string; questions: string; closing: string };
}

export const INDUSTRY_PROFILES: Record<Industry, IndustryProfile> = {
  law_finance: {
    label: "Law, accounting and finance",
    examples: "law firms, accountants, auditors, financial advisers",
    directions: ["formal", "editorial"],
    palettes: ["navy", "oxblood", "slate", "forest", "pine", "gold"],
    motifs: ["scale", "ripple"],
    defaults: [
      { direction: "formal", palette: "navy", motif: "scale" },
      { direction: "formal", palette: "oxblood" },
      { direction: "editorial", palette: "slate" },
    ],
    tone: "Precise, calm and plain. Short sentences, no exclamation marks, no promises of outcomes. Name the areas of law or accounting exactly as the firm does.",
    parts: {
      reasons: "what makes the firm a safe choice: experience the material states, who they work for, how they work",
      services: "practice areas or services, each with who it is for",
      firstSteps: "how the first consultation works and what to bring",
      proof: "credentials and memberships the material names; client quotes only with consent",
      questions: "what clients ask before they get in touch: fees, confidentiality, timelines",
      closing: "an invitation to a first conversation, without pressure",
    },
  },
  consulting: {
    label: "Consulting and B2B services",
    examples: "consultants, agencies, IT and engineering services, training",
    directions: ["formal", "editorial", "statement"],
    palettes: ["navy", "slate", "cobalt", "measure", "indigo", "dry"],
    motifs: ["ripple"],
    defaults: [
      { direction: "editorial", palette: "slate" },
      { direction: "formal", palette: "cobalt" },
      { direction: "statement", palette: "measure", type: "grotesk" },
    ],
    tone: "Clear and concrete. Say what problem is solved for whom, with the client's own examples. No buzzwords.",
    parts: {
      reasons: "concrete results or ways of working the material describes",
      services: "offers, each with the problem it solves",
      firstSteps: "how a project starts: first call, proposal, start",
      proof: "named clients or cases the material gives; quotes only with consent",
      questions: "price models, timelines, who does the work",
      closing: "an invitation to describe the need",
    },
  },
  trades: {
    label: "Trades and building",
    examples: "carpenters, plumbers, electricians, builders, painters, roofers, gardeners",
    directions: ["statement", "editorial", "formal"],
    palettes: ["timber", "hazard", "signal", "harbor", "brick", "steel", "forest", "ochre", "dry"],
    motifs: ["pipe", "drain", "courses"],
    defaults: [
      { direction: "editorial", palette: "timber" },
      { direction: "statement", palette: "hazard", type: "wide" },
      { direction: "formal", palette: "brick" },
    ],
    tone: "Direct and down to earth, like the owner talking to a homeowner. Concrete materials, places and times. No marketing words.",
    parts: {
      reasons: "what the customer can count on: response time, own workshop, guarantees only if the material states them",
      services: "the jobs they do, in the words customers use",
      firstSteps: "from first message to a quote and a visit",
      proof: "finished jobs and customer words with consent",
      questions: "prices, timelines, areas served, ROT/tax deductions if the material mentions them",
      closing: "ask for a quote, with what to send",
    },
  },
  interior_design: {
    label: "Interior design and architecture",
    examples: "interior designers, architects, furniture makers, stylists",
    directions: ["editorial", "formal"],
    palettes: ["pine", "slate", "verdigris", "timber", "ochre", "terracotta"],
    motifs: [],
    defaults: [
      { direction: "editorial", palette: "verdigris" },
      { direction: "formal", palette: "slate" },
      { direction: "editorial", palette: "ochre" },
    ],
    tone: "Calm and visual. Few words, let the work speak. Describe materials, light and the feeling of a room in the client's own terms.",
    parts: {
      reasons: "the studio's way of seeing a space, in its own words",
      services: "what a client can hire them for, from a consultation to a whole project",
      firstSteps: "how a project begins: meeting, brief, concept",
      proof: "projects and client words with consent",
      questions: "budget, timelines, working remotely, who buys the furniture",
      closing: "an invitation to tell about the space",
    },
  },
  cafe_restaurant: {
    label: "Café, restaurant and food",
    examples: "cafés, restaurants, bakeries, food trucks, catering",
    directions: ["editorial", "statement"],
    palettes: ["terracotta", "ochre", "plum", "ember", "brick", "timber", "forest"],
    motifs: [],
    defaults: [
      { direction: "editorial", palette: "terracotta" },
      { direction: "statement", palette: "ember", type: "grotesk" },
      { direction: "editorial", palette: "plum" },
    ],
    tone: "Warm, sensory and personal, in short sentences. Name real dishes, ingredients, the place and the people. Opening hours and address exactly as the material gives them.",
    parts: {
      reasons: "what makes the place itself: the food, the people, the room, the neighbourhood",
      services: "menu highlights or what they serve, with prices only as the material gives them; catering or private events if offered",
      firstSteps: "how to come by: where it is, opening hours, booking or not",
      proof: "guest words with consent",
      questions: "allergies, booking, groups, takeaway, parking",
      closing: "an invitation to come by or book a table",
    },
  },
  health_beauty: {
    label: "Health, beauty and wellbeing",
    examples: "hairdressers, beauty salons, physiotherapists, massage, dentists, yoga studios",
    directions: ["editorial", "formal"],
    palettes: ["teal", "plum", "measure", "cobalt", "pine", "terracotta"],
    motifs: ["ripple"],
    defaults: [
      { direction: "editorial", palette: "teal", motif: "ripple" },
      { direction: "editorial", palette: "plum" },
      { direction: "formal", palette: "pine" },
    ],
    tone: "Caring and reassuring, never clinical or pushy. No health claims beyond what the material states.",
    parts: {
      reasons: "how a visit feels and who takes care of the client",
      services: "treatments with length and price as the material gives them",
      firstSteps: "how to book and what happens at the first visit",
      proof: "client words with consent; qualifications the material names",
      questions: "cancellations, what to bring, payment, Kela or insurance if the material mentions it",
      closing: "book a time",
    },
  },
  retail: {
    label: "Shops and retail",
    examples: "boutiques, local shops, florists, galleries",
    directions: ["statement", "editorial"],
    palettes: ["ember", "indigo", "terracotta", "gold", "plum", "signal"],
    motifs: [],
    defaults: [
      { direction: "statement", palette: "indigo", type: "grotesk" },
      { direction: "editorial", palette: "terracotta" },
      { direction: "statement", palette: "gold", type: "wide" },
    ],
    tone: "Lively and personal, about what is on the shelves and who picks it. Prices only as the material gives them.",
    parts: {
      reasons: "what you find here and nowhere else",
      services: "product areas or brands they carry",
      firstSteps: "how to visit or order",
      proof: "customer words with consent",
      questions: "opening hours, gift cards, returns, delivery",
      closing: "an invitation to come by",
    },
  },
  other: {
    label: "Other services",
    examples: "anything that does not fit above",
    directions: ["editorial", "formal", "statement"],
    palettes: SERVICES_PALETTES,
    motifs: SERVICES_MOTIFS,
    defaults: [
      { direction: "editorial", palette: "pine" },
      { direction: "formal", palette: "navy" },
      { direction: "statement", palette: "signal", type: "grotesk" },
    ],
    tone: "Plain and friendly, in the client's own words.",
    parts: {
      reasons: "why choose the firm, from the material",
      services: "what it offers",
      firstSteps: "how working together starts",
      proof: "customer words with consent",
      questions: "what customers ask",
      closing: "how to get in touch",
    },
  },
};

/** Does a style belong to the industry's range? */
export function fitsIndustry(industry: Industry, style: Style): boolean {
  const profile = INDUSTRY_PROFILES[industry];
  return profile.directions.includes(style.direction) && profile.palettes.includes(style.palette) && (!style.motif || profile.motifs.includes(style.motif));
}

/**
 * Stock phrases that make a website read as written by a template or an AI,
 * in each language. The draft must not use them; the spec warns when they appear.
 */
export const STOCK_PHRASES: { pattern: RegExp; phrase: string }[] = [
  ...[
    "passionate about", "tailored solutions", "tailor-made solutions", "one-stop shop", "look no further", "second to none", "state-of-the-art", "cutting-edge", "world-class", "we pride ourselves", "your trusted partner", "unparalleled", "seamless", "elevate your", "unlock the", "in today's fast-paced", "quality and service", "customer satisfaction is our",
    "brinner för", "skräddarsydda lösningar", "skräddarsydd lösning", "kvalitet och service", "din pålitliga partner", "vi är stolta över att", "i dagens snabba", "helhetslösningar", "nöjda kunder är vår", "när kvalitet räknas", "till nästa nivå",
    "intohimolla", "räätälöidyt ratkaisut", "räätälöityjä ratkaisuja", "laatua ja palvelua", "luotettava kumppanisi", "olemme ylpeitä", "kokonaisvaltaiset ratkaisut", "seuraavalle tasolle", "asiakastyytyväisyys on",
  ].map((phrase) => ({ phrase, pattern: new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })),
];

export function stockPhrase(text: string): string | null {
  return STOCK_PHRASES.find(({ pattern }) => pattern.test(text))?.phrase ?? null;
}
