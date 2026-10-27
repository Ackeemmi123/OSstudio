/**
 * The structured brief: which facts exist, how they are grouped, the question
 * onboarding asks for each, and when a question applies. The onboarding flow
 * and the brief on the client workspace both read this catalog, so a new
 * question set is added here and nowhere else.
 */
import { CONTEXT_FIELD_LABELS } from "./labels";
import {
  CONTEXT_FIELD_KEYS,
  type Client,
  type ContextField,
  type ContextFieldKey,
  type Onboarding,
  type OnboardingStep,
  type ProjectType,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Sales channels                                                             */
/* -------------------------------------------------------------------------- */

export const SALES_CHANNELS = ["shopify", "woocommerce", "amazon", "etsy", "social", "custom", "other", "none"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  amazon: "Amazon",
  etsy: "Etsy",
  social: "TikTok or Instagram",
  custom: "Custom website",
  other: "Other",
  none: "Not selling online yet",
};

/**
 * Applies a channel toggle. "Not selling online yet" cannot be combined with
 * an active channel, so choosing one clears the other.
 */
export function toggleSalesChannel(current: SalesChannel[], channel: SalesChannel): SalesChannel[] {
  if (current.includes(channel)) return current.filter((c) => c !== channel);
  if (channel === "none") return ["none"];
  return normalizeSalesChannels([...current.filter((c) => c !== "none"), channel]);
}

/** Canonical order, no duplicates, and "none" never mixed with active channels. */
export function normalizeSalesChannels(channels: SalesChannel[]): SalesChannel[] {
  const set = new Set(channels);
  if (set.has("none") && set.size > 1) throw new BriefError("“Not selling online yet” can’t be combined with active sales channels.");
  return SALES_CHANNELS.filter((channel) => set.has(channel));
}

/**
 * Sales channels are stored as a readable list of labels ("Shopify, Etsy"),
 * so the brief, the database and future agents all read the same plain value.
 */
export function encodeSalesChannels(channels: SalesChannel[]): string {
  return normalizeSalesChannels(channels)
    .map((channel) => SALES_CHANNEL_LABELS[channel])
    .join(", ");
}

/** Reads a stored value back. Text that is not a known channel is returned separately, never dropped. */
export function decodeSalesChannels(value: string | null): { channels: SalesChannel[]; unrecognized: string[] } {
  if (!value) return { channels: [], unrecognized: [] };
  const byLabel = new Map(SALES_CHANNELS.map((channel) => [SALES_CHANNEL_LABELS[channel].toLowerCase(), channel]));
  const channels: SalesChannel[] = [];
  const unrecognized: string[] = [];
  for (const part of value.split(",").map((p) => p.trim()).filter(Boolean)) {
    const channel = byLabel.get(part.toLowerCase());
    if (channel) channels.push(channel);
    else unrecognized.push(part);
  }
  return { channels: SALES_CHANNELS.filter((c) => channels.includes(c)), unrecognized };
}

export class BriefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BriefError";
  }
}

/* -------------------------------------------------------------------------- */
/* Question catalog                                                           */
/* -------------------------------------------------------------------------- */

/** What the questions depend on: the project type and earlier answers. */
export interface BriefConditions {
  projectType: ProjectType | null;
  salesChannels: SalesChannel[];
}

export type BriefInput = "text" | "longText" | "url" | "channels";
export type BriefScope = "client" | "engagement";

export interface BriefFieldDefinition {
  key: ContextFieldKey;
  step: Exclude<OnboardingStep, "review">;
  /** Client facts describe the business; engagement facts describe the work being scoped. */
  scope: BriefScope;
  input: BriefInput;
  question: (c: BriefConditions) => string;
  hint?: (c: BriefConditions) => string | undefined;
  placeholder?: (c: BriefConditions) => string | undefined;
  /** When the question is worth asking. Values already recorded are always shown in the brief. */
  appliesTo?: (c: BriefConditions) => boolean;
  /** Needed before work can be scoped. Everything else is helpful but optional. */
  essential?: boolean;
}

export function isCommerce(projectType: ProjectType | null): boolean {
  return projectType === "ecommerce" || projectType === "website_ecommerce";
}

const sellsOnline = (c: BriefConditions) => c.salesChannels.some((channel) => channel !== "none");
const notYetOnline = (c: BriefConditions) => c.salesChannels.includes("none");

const always = (text: string) => () => text;

export const BRIEF_FIELDS: BriefFieldDefinition[] = [
  /* Business ---------------------------------------------------------------- */
  {
    key: "industry",
    step: "business",
    scope: "client",
    input: "text",
    question: always("What kind of business is it?"),
    placeholder: always("e.g. Furniture atelier, dental clinic, coffee roaster"),
  },
  {
    key: "offering",
    step: "business",
    scope: "client",
    input: "longText",
    question: (c) => (isCommerce(c.projectType) ? "What do they sell?" : "What products or services do they offer?"),
    placeholder: (c) => (isCommerce(c.projectType) ? "Product range, price level, number of products" : "Main services, who delivers them"),
  },

  /* Current setup ----------------------------------------------------------- */
  {
    key: "salesChannels",
    step: "setup",
    scope: "client",
    input: "channels",
    question: always("Where do they sell today?"),
    hint: always("Select every channel that applies."),
    appliesTo: (c) => isCommerce(c.projectType),
  },
  {
    key: "storeUrl",
    step: "setup",
    scope: "client",
    input: "url",
    question: (c) => (c.salesChannels.length === 1 && c.salesChannels[0] !== "custom" && c.salesChannels[0] !== "other"
      ? `What is the ${SALES_CHANNEL_LABELS[c.salesChannels[0]]} store address?`
      : "What is the main store address?"),
    placeholder: always("store.example.com"),
    appliesTo: (c) => isCommerce(c.projectType) && sellsOnline(c),
  },
  {
    key: "platform",
    step: "setup",
    scope: "client",
    input: "text",
    question: (c) => (isCommerce(c.projectType) ? "What runs the custom or other store?" : "What is the current website built on?"),
    placeholder: (c) => (isCommerce(c.projectType) ? "e.g. Magento, Squarespace, an in-house system" : "e.g. WordPress, Squarespace, no website yet"),
    // Shopify, WooCommerce and the marketplaces already name the platform.
    appliesTo: (c) => !isCommerce(c.projectType) || c.salesChannels.includes("custom") || c.salesChannels.includes("other"),
  },
  {
    key: "integrations",
    step: "setup",
    scope: "client",
    input: "longText",
    question: (c) =>
      isCommerce(c.projectType) ? "Which systems must the shop connect to?" : "Which tools or systems must the website work with?",
    placeholder: (c) =>
      isCommerce(c.projectType)
        ? "Payments, shipping, accounting (e.g. Fortnox), ERP, email marketing"
        : "Booking, CRM, newsletter, analytics",
  },

  /* Goals and audience ------------------------------------------------------ */
  {
    key: "goal",
    step: "goals",
    scope: "engagement",
    input: "longText",
    question: always("What is the main goal of the project?"),
    placeholder: always("What should be different when the project is done?"),
    essential: true,
  },
  {
    key: "targetAudience",
    step: "goals",
    scope: "engagement",
    input: "text",
    question: always("Who is it for?"),
    placeholder: (c) => (isCommerce(c.projectType) ? "Who buys, and where are they?" : "Who should the website reach?"),
  },
  {
    key: "challenges",
    step: "goals",
    scope: "engagement",
    input: "longText",
    question: (c) => (notYetOnline(c) ? "What has kept them from selling online so far?" : "What is not working today?"),
  },
  {
    key: "outcomes",
    step: "goals",
    scope: "engagement",
    input: "longText",
    question: always("How will they measure success?"),
    placeholder: (c) => (isCommerce(c.projectType) ? "e.g. online revenue, conversion, repeat orders" : "e.g. enquiries, bookings, applications"),
  },

  /* Scope and requirements -------------------------------------------------- */
  {
    key: "requirements",
    step: "scope",
    scope: "engagement",
    input: "longText",
    question: always("What must the project include?"),
    placeholder: (c) =>
      isCommerce(c.projectType)
        ? sellsOnline(c)
          ? "Catalogue, checkout, subscriptions, migrating products, customers and orders…"
          : "Catalogue, payments, shipping, first product import…"
        : c.projectType === "brand_website"
          ? "Identity, guidelines, pages, languages…"
          : "Pages, features, languages, forms…",
    essential: true,
  },
  {
    key: "designPreferences",
    step: "scope",
    scope: "engagement",
    input: "longText",
    question: (c) =>
      c.projectType === "brand_website" ? "What should change about the brand, and what must stay?" : "Any design preferences or references?",
    placeholder: always("Sites they like, existing guidelines, words that describe the feel"),
  },
  {
    key: "content",
    step: "scope",
    scope: "engagement",
    input: "longText",
    question: always("Who provides the content?"),
    placeholder: (c) =>
      isCommerce(c.projectType) ? "Product photos, descriptions, translations" : "Texts, photography, translations",
  },
  {
    key: "technicalConstraints",
    step: "scope",
    scope: "engagement",
    input: "longText",
    question: always("Any technical constraints?"),
    placeholder: always("Hosting, domains, accessibility, systems that must stay"),
  },
  {
    key: "existingMaterials",
    step: "scope",
    scope: "engagement",
    input: "longText",
    question: always("What existing material can we use?"),
    placeholder: always("Brand guidelines, copy decks, analytics access, links"),
  },

  /* Budget and timing ------------------------------------------------------- */
  {
    key: "budget",
    step: "timeline",
    scope: "engagement",
    input: "text",
    question: always("Is there a budget or range?"),
    hint: always("Leave it unknown rather than guessing."),
    placeholder: always("An amount or a range"),
    essential: true,
  },
  {
    key: "deadline",
    step: "timeline",
    scope: "engagement",
    input: "text",
    question: always("Is there a launch date or deadline?"),
    hint: always("A date (YYYY-MM-DD) or a timeframe, like “before spring”."),
    placeholder: always("YYYY-MM-DD or a timeframe"),
    essential: true,
  },
  {
    key: "dependencies",
    step: "timeline",
    scope: "engagement",
    input: "longText",
    question: always("What does the timeline depend on?"),
    placeholder: always("Events, approvals, other suppliers, content deliveries"),
  },
];

export const BRIEF_FIELD: Record<ContextFieldKey, BriefFieldDefinition> = Object.fromEntries(
  BRIEF_FIELDS.map((definition) => [definition.key, definition]),
) as Record<ContextFieldKey, BriefFieldDefinition>;

// Every context key must have exactly one definition.
if (BRIEF_FIELDS.length !== CONTEXT_FIELD_KEYS.length || CONTEXT_FIELD_KEYS.some((key) => !BRIEF_FIELD[key])) {
  throw new Error("The brief catalog is out of sync with CONTEXT_FIELD_KEYS.");
}

export function briefConditions(client: Client): BriefConditions {
  return { projectType: client.projectType, salesChannels: decodeSalesChannels(client.context.salesChannels.value).channels };
}

export function fieldApplies(key: ContextFieldKey, conditions: BriefConditions): boolean {
  return BRIEF_FIELD[key].appliesTo?.(conditions) ?? true;
}

/* -------------------------------------------------------------------------- */
/* Question state                                                             */
/* -------------------------------------------------------------------------- */

/**
 * - ask: unknown and not skipped, so onboarding asks for it.
 * - verify: a value exists but nobody confirmed it (observed or proposed): show it, let a person confirm or correct.
 * - known: confirmed. Not asked again, but still editable.
 * - skipped: a person said it is not known yet.
 */
export type QuestionState = "ask" | "verify" | "known" | "skipped";

export function questionState(field: ContextField, key: ContextFieldKey, onboarding?: Pick<Onboarding, "skipped"> | null): QuestionState {
  if (field.value !== null) return field.confidence === "confirmed" ? "known" : "verify";
  return onboarding?.skipped.includes(key) ? "skipped" : "ask";
}

/** The questions for one step, given what the client has already told us. */
export function stepFields(step: OnboardingStep, conditions: BriefConditions): BriefFieldDefinition[] {
  return BRIEF_FIELDS.filter((definition) => definition.step === step && fieldApplies(definition.key, conditions));
}

/* -------------------------------------------------------------------------- */
/* Gaps                                                                       */
/* -------------------------------------------------------------------------- */

export interface BriefGaps {
  /** Relevant, still unknown, and not set aside. Essentials first. */
  missing: ContextFieldKey[];
  /** Marked as not known yet during onboarding. */
  skipped: ContextFieldKey[];
  /** Has a value nobody has confirmed. Proposals first. */
  unconfirmed: ContextFieldKey[];
}

export function getBriefGaps(client: Client, onboarding?: Pick<Onboarding, "skipped"> | null): BriefGaps {
  const conditions = briefConditions(client);
  const relevant = BRIEF_FIELDS.filter((d) => fieldApplies(d.key, conditions));
  const byEssential = (a: BriefFieldDefinition, b: BriefFieldDefinition) => Number(Boolean(b.essential)) - Number(Boolean(a.essential));

  const missing: ContextFieldKey[] = [];
  const skipped: ContextFieldKey[] = [];
  for (const definition of [...relevant].sort(byEssential)) {
    const state = questionState(client.context[definition.key], definition.key, onboarding);
    if (state === "ask") missing.push(definition.key);
    if (state === "skipped") skipped.push(definition.key);
  }
  const unconfirmed = CONTEXT_FIELD_KEYS.filter((key) => questionState(client.context[key], key) === "verify").sort(
    (a, b) => Number(client.context[b].confidence === "proposed") - Number(client.context[a].confidence === "proposed"),
  );
  return { missing, skipped, unconfirmed };
}

export function fieldLabel(key: ContextFieldKey): string {
  return CONTEXT_FIELD_LABELS[key];
}
