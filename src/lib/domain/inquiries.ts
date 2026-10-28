/**
 * Website inquiries: what staff see before deciding, and what each decision
 * writes. See docs/inquiries.md and the plan's field mapping.
 *
 * Rules enforced here, whatever the UI does:
 * - Only a person decides an inquiry, and only once (the database checks both
 *   again).
 * - Approving creates one client in "onboarding", the message as source
 *   material, budget and timing as observed brief values that point back to
 *   the inquiry, and a draft onboarding. The message is never turned into a
 *   goal or any other value: the intake agent proposes those, with quotes.
 * - Adding to an existing client only fills what is still unknown. It never
 *   overwrites a value; differences are listed for the person instead.
 * - The budget is indicative. Nothing here ranks, filters or decides by it.
 */
import { buildNewClient, clean, clientEvent, DomainConflictError, DomainError, setContextField, toClientDetailsInput, updateClientDetails, type DomainDeps } from "./clients";
import { addContextItem, buildSource } from "./intake";
import { buildOnboarding } from "./onboarding";
import {
  type ActivityEvent,
  type Client,
  type ContextFieldKey,
  type ContextItem,
  type Inquiry,
  type InquiryStatus,
  type Onboarding,
  type ProjectType,
  type SourceDocument,
  type SourceReference,
  type StudioSnapshot,
} from "./types";
import { hasErrors, validateClientIdentity } from "./validation";

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

export const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: "New",
  approved: "Approved",
  rejected: "Rejected",
  spam: "Spam",
  merged: "Merged",
};

export const INQUIRY_SERVICE_LABELS: Record<Inquiry["service"], string> = {
  websites: "Websites",
  marketing: "Marketing",
  other: "Something else",
};

export const INQUIRY_PROJECT_TYPE_LABELS: Record<NonNullable<Inquiry["projectType"]>, string> = {
  website: "Website",
  ecommerce: "E-commerce",
  website_ecommerce: "Website & E-commerce",
  brand_website: "Brand & Website",
  not_sure: "Not sure yet",
};

/** Indicative ranges chosen on the website. Not Axivo's prices. */
export const INQUIRY_BUDGET_LABELS: Record<Exclude<NonNullable<Inquiry["budget"]>, "custom">, string> = {
  under_1k: "Under €1,000",
  "1k_3k": "€1,000–€3,000",
  "3k_5k": "€3,000–€5,000",
  "5k_10k": "€5,000–€10,000",
  over_10k: "Over €10,000",
  not_sure: "Not sure, would like to discuss",
};

export const INQUIRY_TIMELINE_LABELS: Record<NonNullable<Inquiry["timeline"]>, string> = {
  asap: "As soon as possible",
  within_3_months: "Within 3 months",
  "3_6_months": "In 3–6 months",
  flexible: "Flexible",
};

export const INQUIRY_LOCALE_LABELS: Record<Inquiry["locale"], string> = { en: "English", sv: "Swedish", fi: "Finnish" };

export function formatEuros(amount: number): string {
  return `€${amount.toLocaleString("en")}`;
}

/** What the customer chose for budget, as shown on the review page. Null when they skipped it. */
export function inquiryBudgetLabel(inquiry: Inquiry): string | null {
  if (inquiry.budget === "custom") return inquiry.budgetAmount !== null ? formatEuros(inquiry.budgetAmount) : null;
  return inquiry.budget ? INQUIRY_BUDGET_LABELS[inquiry.budget] : null;
}

/** "Within 3 months; desired date 2027-03-15". Null when they gave neither. */
export function inquiryTimingLabel(inquiry: Inquiry): string | null {
  const parts = [
    inquiry.timeline ? INQUIRY_TIMELINE_LABELS[inquiry.timeline] : null,
    inquiry.desiredDate ? `${inquiry.timeline ? "desired date" : "Desired date"} ${inquiry.desiredDate}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : null;
}

/** The name a new client gets unless the reviewer changes it: the company, or else the person. */
export function inquiryClientName(inquiry: Inquiry): string {
  return inquiry.company ?? inquiry.contactName;
}

/** "Website inquiry · 28 Oct 2026", the label on the source material and on brief values. */
export function inquirySourceLabel(inquiry: Inquiry): string {
  const day = new Date(inquiry.receivedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Helsinki" });
  return `Website inquiry · ${day}`;
}

/* -------------------------------------------------------------------------- */
/* Lists                                                                      */
/* -------------------------------------------------------------------------- */

/** Inquiries waiting for a decision, newest first. Never sorted or filtered by budget. */
export function getOpenInquiries(snapshot: StudioSnapshot): Inquiry[] {
  return snapshot.inquiries.filter((i) => i.status === "new").sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/** One short line under the sender's name: service, project type and timing. */
export function describeInquiry(inquiry: Inquiry): string {
  return [
    inquiry.projectType && inquiry.projectType !== "not_sure" ? INQUIRY_PROJECT_TYPE_LABELS[inquiry.projectType] : INQUIRY_SERVICE_LABELS[inquiry.service],
    inquiry.timeline ? INQUIRY_TIMELINE_LABELS[inquiry.timeline] : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Earlier and later inquiries from the same email address, newest first. */
export function getRelatedInquiries(inquiry: Inquiry, inquiries: Inquiry[]): Inquiry[] {
  const email = normalizeEmail(inquiry.email);
  return inquiries
    .filter((other) => other.id !== inquiry.id && normalizeEmail(other.email) === email)
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

export type MatchReason = "email" | "website" | "name" | "contact";

export interface ClientMatch {
  client: Client;
  reasons: MatchReason[];
}

/**
 * Existing clients the inquiry may belong to: same email, same website
 * domain, the same company name, or the same contact person. Suggestions
 * only, strongest first; a person decides.
 */
export function findInquiryMatches(inquiry: Inquiry, clients: Client[]): ClientMatch[] {
  const email = normalizeEmail(inquiry.email);
  const domain = inquiry.website ? websiteDomain(inquiry.website) : null;
  const names = new Set([inquiry.company, inquiry.contactName].filter((n): n is string => Boolean(n)).map(normalizeName));
  const person = normalizeName(inquiry.contactName);
  const weight: Record<MatchReason, number> = { email: 4, website: 2, name: 1, contact: 1 };

  return clients
    .flatMap((client) => {
      const reasons: MatchReason[] = [];
      if (client.email && normalizeEmail(client.email) === email) reasons.push("email");
      if (domain && client.website && websiteDomain(client.website) === domain) reasons.push("website");
      if (names.has(normalizeName(client.name))) reasons.push("name");
      if (client.contactPerson && normalizeName(client.contactPerson) === person) reasons.push("contact");
      return reasons.length ? [{ client, reasons }] : [];
    })
    .sort((a, b) => score(b) - score(a) || a.client.name.localeCompare(b.client.name));

  function score(match: ClientMatch) {
    return match.reasons.reduce((sum, reason) => sum + weight[reason], 0);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase();
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/** "https://www.Example.com/about" → "example.com". */
export function websiteDomain(website: string): string {
  return website
    .trim()
    .toLocaleLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#:]/)[0];
}

/* -------------------------------------------------------------------------- */
/* What a decision writes                                                     */
/* -------------------------------------------------------------------------- */

export function assertDecidable(inquiry: Inquiry, deps: DomainDeps) {
  if (deps.actor.kind !== "human") throw new DomainError("Only a person can decide an inquiry.");
  if (inquiry.status !== "new") {
    throw new DomainConflictError("This inquiry has already been decided. Reload to see the decision.");
  }
}

function inquirySource(inquiry: Inquiry): SourceReference {
  return { type: "contact_form", label: inquirySourceLabel(inquiry), inquiryId: inquiry.id };
}

/** Budget and timing as the brief records them, with a note on where they came from. */
export function inquiryBriefValues(inquiry: Inquiry): Partial<Record<ContextFieldKey, { value: string; note: string }>> {
  const values: Partial<Record<ContextFieldKey, { value: string; note: string }>> = {};
  if (inquiry.budget === "custom" && inquiry.budgetAmount !== null) {
    values.budget = { value: formatEuros(inquiry.budgetAmount), note: "Amount entered on the website form" };
  } else if (inquiry.budget && inquiry.budget !== "not_sure" && inquiry.budget !== "custom") {
    values.budget = { value: `${INQUIRY_BUDGET_LABELS[inquiry.budget]} (indicative)`, note: "Indicative range chosen on the website form" };
  }
  const timing = inquiryTimingLabel(inquiry);
  if (timing) values.deadline = { value: timing, note: "From the website form" };
  return values;
}

/** The project type the client starts with, from what the customer chose. */
export function inquiryProjectType(inquiry: Inquiry): ProjectType | null {
  if (inquiry.projectType) return inquiry.projectType === "not_sure" ? null : inquiry.projectType;
  return inquiry.service === "marketing" ? "other" : null;
}

/** The message as source material for the team and the intake agent. */
export function inquirySourceContent(inquiry: Inquiry): string {
  return `Language: ${INQUIRY_LOCALE_LABELS[inquiry.locale]}\n\n${inquiry.message}`;
}

export const DISCUSS_BUDGET_QUESTION = "Discuss budget with the customer";

export interface InquiryApproval {
  client: Client;
  source: SourceDocument;
  onboarding: Onboarding;
  /** Open questions added to the new client. */
  items: ContextItem[];
  events: ActivityEvent[];
}

/**
 * Approves an inquiry as a new client: contact details, budget and timing as
 * observed values, the message as source material, and a draft onboarding in
 * which those values show as "verify" rather than being asked again.
 */
export function approveInquiry(inquiry: Inquiry, name: string, deps: DomainDeps): InquiryApproval {
  assertDecidable(inquiry, deps);
  const errors = validateClientIdentity({ name, email: inquiry.email, website: inquiry.website ?? undefined });
  if (hasErrors(errors)) throw new DomainError(Object.values(errors)[0] ?? "Check the client details.");

  const now = deps.now();
  const at: DomainDeps = { ...deps, now: () => now };
  const created = buildNewClient(
    {
      name,
      contactPerson: inquiry.contactName,
      email: inquiry.email,
      website: inquiry.website ?? undefined,
      projectType: inquiryProjectType(inquiry) ?? "",
      initialNotes: inquiry.message,
      sourceType: "contact_form",
    },
    at,
  );
  let client: Client = {
    ...created.client,
    status: "onboarding",
    source: { ...created.client.source, receivedAt: inquiry.receivedAt },
  };
  const events: ActivityEvent[] = [clientEvent(client.id, "client.created", `Added ${client.name} from a website inquiry`, at, now)];

  const source = inquirySource(inquiry);
  const brief = inquiryBriefValues(inquiry);
  for (const [key, entry] of Object.entries(brief) as [ContextFieldKey, { value: string; note: string }][]) {
    client.context[key] = { value: entry.value, confidence: "observed", source, note: entry.note, recordedBy: deps.actor, updatedAt: now };
  }
  const recorded = (["budget", "deadline"] as const).filter((key) => brief[key]);
  if (recorded.length) {
    events.push(clientEvent(client.id, "client.context_updated", `Recorded ${recorded.join(" and ")} from the website inquiry`, at, now));
  }

  const items: ContextItem[] = [];
  if (inquiry.budget === "not_sure") {
    const added = addContextItem(client, { kind: "question", text: DISCUSS_BUDGET_QUESTION }, at);
    client = added.client;
    items.push(added.item);
    events.push(added.event);
  }

  const material = buildSource(client, { type: "contact_form", label: source.label!, content: inquirySourceContent(inquiry) }, at);
  events.push(material.event);
  const started = buildOnboarding(client, at);
  events.push(started.event);

  return { client, source: material.source, onboarding: started.onboarding, items, events };
}

export interface InquiryLink {
  client: Client;
  source: SourceDocument;
  /** Whether empty contact details were filled in. */
  detailsChanged: boolean;
  /** Brief values that were unknown and are now filled in. */
  changedFields: ContextFieldKey[];
  events: ActivityEvent[];
}

export interface InquiryDifference {
  label: string;
  inquiry: string;
  client: string;
}

/** Where the inquiry says something else than the client record. Shown before linking; never applied. */
export function compareInquiryToClient(inquiry: Inquiry, client: Client): InquiryDifference[] {
  const differences: InquiryDifference[] = [];
  const add = (label: string, fromInquiry: string | null, onClient: string | null, same: (a: string, b: string) => boolean) => {
    if (fromInquiry && onClient && !same(fromInquiry, onClient)) differences.push({ label, inquiry: fromInquiry, client: onClient });
  };
  const exact = (a: string, b: string) => normalizeName(a) === normalizeName(b);
  add("Contact person", inquiry.contactName, client.contactPerson, exact);
  add("Email", inquiry.email, client.email, (a, b) => normalizeEmail(a) === normalizeEmail(b));
  add("Website", inquiry.website, client.website, (a, b) => websiteDomain(a) === websiteDomain(b));
  const brief = inquiryBriefValues(inquiry);
  add("Budget", brief.budget?.value ?? null, client.context.budget.value, exact);
  add("Deadline", brief.deadline?.value ?? null, client.context.deadline.value, exact);
  return differences;
}

/**
 * Adds an inquiry to an existing client: the message as source material, and
 * contact details and budget or timing only where the client has none yet.
 * Creates no client and no onboarding, and changes no existing value.
 */
export function linkInquiry(inquiry: Inquiry, client: Client, deps: DomainDeps): InquiryLink {
  assertDecidable(inquiry, deps);
  const now = deps.now();
  const at: DomainDeps = { ...deps, now: () => now };
  const events: ActivityEvent[] = [];
  let next = client;

  const details = toClientDetailsInput(next);
  const filled = {
    ...details,
    contactPerson: details.contactPerson || inquiry.contactName,
    email: details.email || inquiry.email,
    website: details.website || (inquiry.website ?? ""),
  };
  const updated = updateClientDetails(next, filled, at);
  next = updated.client;
  events.push(...updated.events);

  const source = inquirySource(inquiry);
  const changedFields: ContextFieldKey[] = [];
  for (const [key, entry] of Object.entries(inquiryBriefValues(inquiry)) as [ContextFieldKey, { value: string; note: string }][]) {
    if (next.context[key].value !== null) continue;
    const result = setContextField(next, key, { value: entry.value, confidence: "observed", source, note: entry.note }, at);
    next = result.client;
    events.push(...result.events);
    changedFields.push(key);
  }

  const material = buildSource(next, { type: "contact_form", label: source.label!, content: inquirySourceContent(inquiry) }, at);
  events.push(material.event);
  return { client: next, source: material.source, detailsChanged: updated.events.length > 0, changedFields, events };
}

export const REJECTION_REASON_MAX_LENGTH = 1000;

/** Checks a rejection reason before it is saved. Internal only. */
export function cleanRejectionReason(reason: string | undefined): string | null {
  const cleaned = clean(reason);
  if (cleaned && cleaned.length > REJECTION_REASON_MAX_LENGTH) {
    throw new DomainError(`Keep the reason under ${REJECTION_REASON_MAX_LENGTH.toLocaleString("en")} characters.`);
  }
  return cleaned;
}
