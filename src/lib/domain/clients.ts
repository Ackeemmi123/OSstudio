import { CONTEXT_FIELD_LABELS, CONFIDENCE_LABELS } from "./labels";
import {
  CONTEXT_FIELD_KEYS,
  type ActivityEvent,
  type Client,
  type ClientContext,
  type ClientUpdateInput,
  type ContextField,
  type ContextFieldKey,
  type ISODateString,
  type NewClientInput,
  type SourceReference,
} from "./types";

export interface DomainDeps {
  now: () => ISODateString;
  createId: () => string;
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
  const now = deps.now();
  const sourceType = input.sourceType || "manual";
  const source: SourceReference = { type: sourceType, label: "Recorded at intake" };

  const observed = (value: string | undefined): ContextField => {
    const cleaned = clean(value);
    return cleaned
      ? { value: cleaned, confidence: "observed", source, updatedAt: now }
      : unknownField(now);
  };

  const context: ClientContext = {
    goal: observed(input.goal),
    targetAudience: observed(input.targetAudience),
    requirements: unknownField(now),
    budget: observed(input.budget),
    deadline: observed(input.deadline),
    platform: unknownField(now),
  };

  const name = clean(input.name);
  if (!name) {
    throw new Error("A client name is required.");
  }

  const client: Client = {
    id: deps.createId(),
    name,
    contactPerson: clean(input.contactPerson),
    email: clean(input.email),
    website: clean(input.website),
    status: "lead",
    projectType: input.projectType || null,
    source: {
      type: sourceType,
      initialNotes: clean(input.initialNotes),
      receivedAt: now,
    },
    context,
    contextItems: [],
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };

  const event: ActivityEvent = {
    id: deps.createId(),
    entityType: "client",
    entityId: client.id,
    eventType: "client.created",
    description: `Client record created for ${client.name}`,
    actor: "You",
    timestamp: now,
  };

  return { client, event };
}

const CORE_FIELD_LABELS = {
  name: "name",
  contactPerson: "contact person",
  email: "email",
  website: "website",
  projectType: "project type",
} as const;

/**
 * Applies an edit to a client. Replaced context values are kept in the
 * field's history as superseded, so earlier information is never silently lost.
 */
export function applyClientUpdate(
  client: Client,
  input: ClientUpdateInput,
  deps: DomainDeps,
): { client: Client; events: ActivityEvent[] } {
  const now = deps.now();
  const changed: string[] = [];

  const name = clean(input.name);
  if (!name) {
    throw new Error("A client name is required.");
  }

  const core = {
    name,
    contactPerson: clean(input.contactPerson),
    email: clean(input.email),
    website: clean(input.website),
    projectType: input.projectType || null,
  };

  for (const key of Object.keys(core) as (keyof typeof core)[]) {
    if (core[key] !== client[key]) changed.push(CORE_FIELD_LABELS[key]);
  }

  const context = { ...client.context };
  for (const key of CONTEXT_FIELD_KEYS) {
    const next = updateContextField(client.context[key], input.context[key], now);
    if (next !== client.context[key]) {
      context[key] = next;
      changed.push(CONTEXT_FIELD_LABELS[key].toLowerCase());
    }
  }

  const statusChanged = input.status !== client.status;
  if (changed.length === 0 && !statusChanged) {
    return { client, events: [] };
  }

  const updated: Client = {
    ...client,
    ...core,
    status: input.status,
    context,
    updatedAt: now,
  };

  const events: ActivityEvent[] = [];
  if (changed.length > 0) {
    events.push({
      id: deps.createId(),
      entityType: "client",
      entityId: client.id,
      eventType: "client.updated",
      description: `Updated ${formatList(changed)}`,
      actor: "You",
      timestamp: now,
    });
  }
  if (statusChanged) {
    events.push({
      id: deps.createId(),
      entityType: "client",
      entityId: client.id,
      eventType: "client.status_changed",
      description: `Status changed to ${input.status.replace("_", " ")}`,
      actor: "You",
      timestamp: now,
    });
  }

  return { client: updated, events };
}

/** Returns the same object when nothing changed so callers can detect edits by identity. */
function updateContextField(
  current: ContextField,
  input: ClientUpdateInput["context"][ContextFieldKey],
  now: ISODateString,
): ContextField {
  const value = clean(input.value);
  const confidence = value ? input.confidence : "unknown";

  if (value === current.value && confidence === current.confidence) {
    return current;
  }

  if (value === current.value) {
    // Same value, new confidence (for example, the client confirmed it).
    return { ...current, confidence, updatedAt: now };
  }

  const history = current.value
    ? [
        { value: current.value, confidence: current.confidence, supersededAt: now },
        ...(current.history ?? []),
      ]
    : current.history;

  return {
    value,
    confidence,
    source: value ? { type: "manual", label: "Edited in Studio OS" } : undefined,
    updatedAt: now,
    history,
  };
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** Prefills the edit form. Unknown fields default to "observed" once a value is entered. */
export function toClientUpdateInput(client: Client): ClientUpdateInput {
  const context = {} as ClientUpdateInput["context"];
  for (const key of CONTEXT_FIELD_KEYS) {
    const field = client.context[key];
    context[key] = {
      value: field.value ?? "",
      confidence: field.confidence === "unknown" || field.confidence === "superseded" ? "observed" : field.confidence,
    };
  }
  return {
    name: client.name,
    contactPerson: client.contactPerson ?? "",
    email: client.email ?? "",
    website: client.website ?? "",
    status: client.status,
    projectType: client.projectType ?? "",
    context,
  };
}

/* -------------------------------------------------------------------------- */
/* Missing information                                                        */
/* -------------------------------------------------------------------------- */

export type MissingFieldKey =
  | "contactPerson"
  | "email"
  | "website"
  | "projectType"
  | ContextFieldKey;

export interface MissingItem {
  key: MissingFieldKey;
  label: string;
  /** Essential items block a meaningful project start. */
  essential: boolean;
}

const ESSENTIAL_FIELDS: ReadonlySet<MissingFieldKey> = new Set([
  "contactPerson",
  "email",
  "goal",
  "budget",
  "deadline",
]);

export function getMissingInformation(client: Client): MissingItem[] {
  const items: MissingItem[] = [];
  const push = (key: MissingFieldKey, label: string) =>
    items.push({ key, label, essential: ESSENTIAL_FIELDS.has(key) });

  if (!client.contactPerson) push("contactPerson", "Contact person");
  if (!client.email) push("email", "Email");
  if (!client.website) push("website", "Website");
  if (!client.projectType) push("projectType", "Project type");
  for (const key of CONTEXT_FIELD_KEYS) {
    if (!client.context[key].value) push(key, CONTEXT_FIELD_LABELS[key]);
  }

  return items.sort((a, b) => Number(b.essential) - Number(a.essential));
}

/** Context values that exist but are not confirmed yet. */
export function getUnconfirmedFields(client: Client): { key: ContextFieldKey; label: string; confidence: string }[] {
  return CONTEXT_FIELD_KEYS.filter((key) => {
    const field = client.context[key];
    return field.value !== null && field.confidence !== "confirmed";
  }).map((key) => ({
    key,
    label: CONTEXT_FIELD_LABELS[key],
    confidence: CONFIDENCE_LABELS[client.context[key].confidence],
  }));
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

/** Number of fields checked by getMissingInformation: four core fields plus every context field. */
export const TRACKED_FIELD_COUNT = 4 + CONTEXT_FIELD_KEYS.length;
