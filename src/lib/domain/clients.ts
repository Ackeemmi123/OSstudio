import { CLIENT_STATUS_LABELS, CONTEXT_FIELD_LABELS } from "./labels";
import {
  CONTEXT_FIELD_KEYS,
  type ActivityEvent,
  type Actor,
  type Client,
  type ClientContext,
  type ClientDetailsInput,
  type ContextField,
  type ContextFieldInput,
  type ContextFieldKey,
  type ISODateString,
  type NewClientInput,
  type SourceReference,
} from "./types";

export interface DomainDeps {
  now: () => ISODateString;
  createId: () => string;
  /** Who is making the change. Defaults to the signed-in person once auth exists. */
  actor: Actor;
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

/** The record changed since the person last saw it. Repositories report it as a conflict. */
export class DomainConflictError extends DomainError {
  constructor(message: string) {
    super(message);
    this.name = "DomainConflictError";
  }
}

/** Trims a string and turns empty values into null, so blanks are never stored as facts. */
export function clean(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function unknownField(now: ISODateString): ContextField {
  return { value: null, confidence: "unknown", updatedAt: now };
}

/** Normalizes a website so it can be used as a link. Leaves the stored value readable. */
export function websiteHref(website: string): string {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export function clientEvent(
  clientId: string,
  eventType: ActivityEvent["eventType"],
  description: string,
  deps: DomainDeps,
  now = deps.now(),
): ActivityEvent {
  return { id: deps.createId(), entityType: "client", entityId: clientId, eventType, description, actor: deps.actor, timestamp: now };
}

/**
 * Builds a new client record from the intake form.
 *
 * Supplied values are stored as "observed": they were recorded from a source
 * but have not been confirmed by the client. Anything not supplied stays
 * "unknown" with no invented value.
 */
export function buildNewClient(
  input: NewClientInput,
  deps: DomainDeps,
): { client: Client; event: ActivityEvent } {
  const name = clean(input.name);
  if (!name) throw new DomainError("A client name is required.");

  const now = deps.now();
  const sourceType = input.sourceType || "manual";
  const source: SourceReference = { type: sourceType, label: "Recorded at intake" };

  const observed = (value: string | undefined): ContextField => {
    const cleaned = clean(value);
    return cleaned
      ? { value: cleaned, confidence: "observed", source, recordedBy: deps.actor, updatedAt: now }
      : unknownField(now);
  };

  const supplied: Partial<Record<ContextFieldKey, string | undefined>> = {
    goal: input.goal,
    targetAudience: input.targetAudience,
    budget: input.budget,
    deadline: input.deadline,
  };
  const context = Object.fromEntries(CONTEXT_FIELD_KEYS.map((key) => [key, observed(supplied[key])])) as ClientContext;

  const client: Client = {
    id: deps.createId(),
    name,
    contactPerson: clean(input.contactPerson),
    email: clean(input.email),
    website: clean(input.website),
    status: "lead",
    projectType: input.projectType || null,
    source: { type: sourceType, initialNotes: clean(input.initialNotes), receivedAt: now },
    context,
    contextItems: [],
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };

  return { client, event: clientEvent(client.id, "client.created", `Added ${client.name}`, deps, now) };
}

const DETAIL_LABELS = {
  name: "name",
  contactPerson: "contact person",
  email: "email",
  website: "website",
  projectType: "project type",
} as const;

/**
 * Applies an edit to the client's identity and relationship details.
 * Returns the same object and no events when nothing changed.
 */
export function updateClientDetails(
  client: Client,
  input: ClientDetailsInput,
  deps: DomainDeps,
): { client: Client; events: ActivityEvent[] } {
  const name = clean(input.name);
  if (!name) throw new DomainError("A client name is required.");

  const details = {
    name,
    contactPerson: clean(input.contactPerson),
    email: clean(input.email),
    website: clean(input.website),
    projectType: input.projectType || null,
  };
  const changed = (Object.keys(details) as (keyof typeof details)[])
    .filter((key) => details[key] !== client[key])
    .map((key) => DETAIL_LABELS[key]);
  const statusChanged = input.status !== client.status;

  if (changed.length === 0 && !statusChanged) return { client, events: [] };

  const now = deps.now();
  const events: ActivityEvent[] = [];
  if (changed.length > 0) {
    events.push(clientEvent(client.id, "client.updated", `Updated ${formatList(changed)}`, deps, now));
  }
  if (statusChanged) {
    events.push(
      clientEvent(client.id, "client.status_changed", `Status changed to ${CLIENT_STATUS_LABELS[input.status]}`, deps, now),
    );
  }

  return { client: { ...client, ...details, status: input.status, updatedAt: now }, events };
}

/**
 * Sets one context value.
 *
 * - A replaced value is kept in history, so earlier information is never lost.
 * - An empty value becomes "unknown".
 * - Agents can propose or record values, but only a person can confirm one.
 */
export function setContextField(
  client: Client,
  key: ContextFieldKey,
  input: ContextFieldInput,
  deps: DomainDeps,
): { client: Client; events: ActivityEvent[] } {
  if (input.confidence === "confirmed" && deps.actor.kind !== "human") {
    throw new DomainError("Only a person can confirm client information.");
  }

  const current = client.context[key];
  const value = clean(input.value);
  const confidence = value ? input.confidence : "unknown";
  if (value === current.value && confidence === current.confidence) return { client, events: [] };

  const now = deps.now();
  const label = CONTEXT_FIELD_LABELS[key].toLowerCase();
  let next: ContextField;
  let description: string;

  const confirmation = confidence === "confirmed" ? { confirmedBy: deps.actor, confirmedAt: now } : {};

  if (value === current.value) {
    // Same value, new confidence (for example, the client confirmed it).
    next = { ...current, confidence, ...confirmation, updatedAt: now };
    if (confidence !== "confirmed") {
      delete next.confirmedBy;
      delete next.confirmedAt;
    }
    description = confidence === "confirmed" ? `Confirmed ${label}` : `Marked ${label} as ${confidence}`;
  } else {
    const history = current.value
      ? [{ value: current.value, confidence: current.confidence, supersededAt: now }, ...(current.history ?? [])]
      : current.history;
    const note = clean(input.note);
    next = value
      ? {
          value,
          confidence,
          source: input.source ?? { type: "manual", label: "Edited in Studio OS" },
          ...(note ? { note } : {}),
          recordedBy: deps.actor,
          ...confirmation,
          updatedAt: now,
          history,
        }
      : { value: null, confidence: "unknown", updatedAt: now, history };
    description = !value ? `Cleared ${label}` : current.value ? `Updated ${label}` : `Added ${label}`;
  }

  return {
    client: { ...client, context: { ...client.context, [key]: next }, updatedAt: now },
    events: [clientEvent(client.id, "client.context_updated", description, deps, now)],
  };
}

export function formatList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function toClientDetailsInput(client: Client): ClientDetailsInput {
  return {
    name: client.name,
    contactPerson: client.contactPerson ?? "",
    email: client.email ?? "",
    website: client.website ?? "",
    status: client.status,
    projectType: client.projectType ?? "",
  };
}

/* -------------------------------------------------------------------------- */
/* Missing and unconfirmed information                                        */
/* -------------------------------------------------------------------------- */

export type MissingFieldKey = "contactPerson" | "email" | ContextFieldKey;

export interface MissingItem {
  key: MissingFieldKey;
  label: string;
}

/** Details the studio needs before a project can be scoped. Everything else is optional. */
const ESSENTIAL_FIELDS: { key: MissingFieldKey; label: string }[] = [
  { key: "contactPerson", label: "Contact person" },
  { key: "email", label: "Email" },
  { key: "goal", label: "Goal" },
  { key: "budget", label: "Budget" },
  { key: "deadline", label: "Deadline" },
];

export function getMissingEssentials(client: Client): MissingItem[] {
  return ESSENTIAL_FIELDS.filter(({ key }) =>
    key === "contactPerson" || key === "email" ? !client[key] : !client.context[key].value,
  );
}

/** Context values that exist but have not been confirmed, proposals first. */
export function getUnconfirmedFields(client: Client): { key: ContextFieldKey; field: ContextField }[] {
  return CONTEXT_FIELD_KEYS.map((key) => ({ key, field: client.context[key] }))
    .filter(({ field }) => field.value !== null && field.confidence !== "confirmed")
    .sort((a, b) => Number(b.field.confidence === "proposed") - Number(a.field.confidence === "proposed"));
}

export function getInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
