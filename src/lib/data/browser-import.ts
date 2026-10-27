/**
 * One-time import of the local browser demo into a Supabase studio.
 *
 * The browser is the only place that can read its own storage, so the import
 * is prepared here: every record is validated, demo records are left out,
 * identifiers are derived from the studio and the local id (so importing the
 * same data again inserts nothing), and actors are marked as imported rather
 * than attributed to the person running the import. The database then writes
 * everything in one transaction (import_browser_data).
 *
 * The browser copy is only removed when a person asks, after the imported
 * records have been read back from the server.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  CLIENT_STATUSES,
  CONTEXT_FIELD_KEYS,
  FIELD_CONFIDENCES,
  ONBOARDING_STATUSES,
  ONBOARDING_STEPS,
  PROJECT_STAGES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  SOURCE_TYPES,
  TASK_STATUSES,
  AGENT_IDS,
  type Actor,
  type ActivityEvent,
  type Client,
  type ContextField,
  type Onboarding,
  type Project,
  type SourceDocument,
  type StudioSnapshot,
  type Task,
} from "@/lib/domain/types";
import { NAME_MAX_LENGTH } from "@/lib/domain/validation";
import { toRepositoryError } from "./supabase-errors";
import { clientRow, contextFieldRow, contextItemRow, eventRow, onboardingRow, projectRow, sourceRow, taskRow } from "./supabase-rows";

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "is not a valid date");
const actor = z.union([
  z.object({ kind: z.literal("human"), name: z.string().trim().min(1).max(120) }).loose(),
  z.object({ kind: z.literal("agent"), agentId: z.enum(AGENT_IDS) }).loose(),
  z.object({ kind: z.literal("system") }).loose(),
]);

const contextField = z
  .object({
    value: z.string().max(5000).nullable(),
    confidence: z.enum(FIELD_CONFIDENCES),
    source: z.object({ type: z.enum(SOURCE_TYPES), label: z.string().max(300).optional(), url: z.string().max(2000).optional() }).optional(),
    note: z.string().max(2000).optional(),
    recordedBy: actor.optional(),
    confirmedBy: actor.optional(),
    confirmedAt: isoDate.optional(),
    updatedAt: isoDate,
    history: z.array(z.object({ value: z.string(), confidence: z.enum(FIELD_CONFIDENCES), supersededAt: isoDate })).optional(),
  })
  .refine((field) => (field.value === null) === (field.confidence === "unknown") && field.confidence !== "superseded", {
    message: "has a value that does not match its certainty",
  });

const clientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  contactPerson: z.string().max(120).nullable(),
  email: z.string().max(254).nullable(),
  website: z.string().max(254).nullable(),
  status: z.enum(CLIENT_STATUSES),
  projectType: z.enum(PROJECT_TYPES).nullable(),
  source: z.object({ type: z.enum(SOURCE_TYPES), initialNotes: z.string().max(20000).nullable(), receivedAt: isoDate }),
  context: z.object(Object.fromEntries(CONTEXT_FIELD_KEYS.map((key) => [key, contextField.optional()]))),
  contextItems: z
    .array(z.object({ id: z.string().min(1), kind: z.enum(["assumption", "question"]), text: z.string().trim().min(1).max(1000), confidence: z.enum(FIELD_CONFIDENCES), createdAt: isoDate }))
    .default([]),
  isDemo: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const projectSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  name: z.string().trim().min(1).max(160),
  projectType: z.enum(PROJECT_TYPES),
  status: z.enum(PROJECT_STATUSES),
  stage: z.enum(PROJECT_STAGES),
  isDemo: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const taskSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  status: z.enum(TASK_STATUSES),
  assignee: z
    .union([z.object({ kind: z.literal("human"), name: z.string().trim().min(1).max(120) }), z.object({ kind: z.literal("agent"), agentId: z.enum(AGENT_IDS) })])
    .nullable(),
  blockedReason: z.string().max(500).optional(),
  dueDate: isoDate.optional(),
  isDemo: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

const eventSchema = z.object({
  id: z.string().min(1),
  entityType: z.enum(["client", "project", "task"]),
  entityId: z.string().min(1),
  eventType: z.string().regex(/^[a-z_]+\.[a-z_]+$/),
  description: z.string().trim().min(1).max(500),
  actor: actor.optional(),
  timestamp: isoDate,
});

const sourceSchema = z.object({
  id: z.string().min(1),
  clientId: z.string().min(1),
  type: z.enum(SOURCE_TYPES),
  label: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(50000),
  receivedAt: isoDate,
  addedBy: actor.optional(),
});

const onboardingSchema = z
  .object({
    id: z.string().min(1),
    clientId: z.string().min(1),
    status: z.enum(ONBOARDING_STATUSES),
    currentStep: z.enum(ONBOARDING_STEPS),
    skipped: z.array(z.enum(CONTEXT_FIELD_KEYS)).max(50).default([]),
    createdAt: isoDate,
    updatedAt: isoDate,
    completedAt: isoDate.nullable().default(null),
  })
  .refine((o) => (o.status === "ready_for_review") === (o.completedAt !== null), { message: "has a finish date that does not match its status" });

export interface SkippedRecord {
  kind: "client" | "project" | "task" | "source" | "onboarding";
  label: string;
  reason: string;
}

export interface ImportPlan {
  /** SHA-256 of the prepared data; the server refuses the same data twice. */
  hash: string;
  payload: Record<
    "clients" | "context_fields" | "context_items" | "sources" | "onboardings" | "projects" | "tasks" | "activity",
    Record<string, unknown>[]
  >;
  counts: { clients: number; projects: number; tasks: number; sources: number; onboardings: number; activity: number };
  /** The ids the imported records will have, to check them after the import. */
  expected: { clients: string[]; projects: string[]; tasks: string[] };
  /** Records that will not be imported, and why. */
  skipped: SkippedRecord[];
  /** Example records, which are never imported. */
  demoRecords: number;
  /** Activity left out because its record was not imported or it was malformed. */
  skippedActivity: number;
}

/** Whether the browser holds anything worth importing (anything besides demo data). */
export function hasImportableData(snapshot: StudioSnapshot | null): boolean {
  return Boolean(snapshot && (snapshot.clients.some((c) => !c.isDemo) || snapshot.projects.some((p) => !p.isDemo) || snapshot.tasks.some((t) => !t.isDemo)));
}

export async function planImport(snapshot: StudioSnapshot, studioId: string): Promise<ImportPlan> {
  const skipped: SkippedRecord[] = [];
  let demoRecords = 0;
  const ids = new Map<string, string>();
  const mapId = async (kind: string, localId: string) => {
    const remote = await deterministicId(studioId, kind, localId);
    ids.set(`${kind}:${localId}`, remote);
    return remote;
  };

  const clients: Client[] = [];
  for (const raw of snapshot.clients) {
    if (raw?.isDemo) {
      demoRecords++;
      continue;
    }
    const parsed = clientSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ kind: "client", label: labelOf(raw, "name"), reason: describeIssue(parsed.error) });
      continue;
    }
    const client = parsed.data as unknown as Client;
    clients.push({ ...client, id: await mapId("client", client.id) });
  }
  const includedClient = (localId: string) => ids.get(`client:${localId}`);

  const projects: Project[] = [];
  for (const raw of snapshot.projects) {
    if (raw?.isDemo) {
      demoRecords++;
      continue;
    }
    const parsed = projectSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ kind: "project", label: labelOf(raw, "name"), reason: describeIssue(parsed.error) });
      continue;
    }
    const clientId = includedClient(parsed.data.clientId);
    if (!clientId) {
      skipped.push({ kind: "project", label: parsed.data.name, reason: "its client is not being imported" });
      continue;
    }
    projects.push({ ...parsed.data, id: await mapId("project", parsed.data.id), clientId });
  }

  const tasks: Task[] = [];
  for (const raw of snapshot.tasks) {
    if (raw?.isDemo) {
      demoRecords++;
      continue;
    }
    const parsed = taskSchema.safeParse(raw);
    if (!parsed.success) {
      skipped.push({ kind: "task", label: labelOf(raw, "title"), reason: describeIssue(parsed.error) });
      continue;
    }
    const projectId = ids.get(`project:${parsed.data.projectId}`);
    if (!projectId) {
      skipped.push({ kind: "task", label: parsed.data.title, reason: "its project is not being imported" });
      continue;
    }
    tasks.push({ ...parsed.data, id: await mapId("task", parsed.data.id), projectId });
  }

  const sources: SourceDocument[] = [];
  for (const raw of snapshot.sources ?? []) {
    const parsed = sourceSchema.safeParse(raw);
    const clientId = parsed.success ? includedClient(parsed.data.clientId) : undefined;
    if (!parsed.success || !clientId) {
      skipped.push({ kind: "source", label: labelOf(raw, "label"), reason: parsed.success ? "its client is not being imported" : describeIssue(parsed.error) });
      continue;
    }
    sources.push({ ...parsed.data, id: await mapId("source", parsed.data.id), clientId, addedBy: imported(parsed.data.addedBy as Actor | undefined) });
  }

  // Onboarding progress, so a person can continue where they left off. The
  // answers themselves are brief values and come with the client.
  const onboardings: Onboarding[] = [];
  const onboarded = new Set<string>();
  for (const raw of snapshot.onboardings ?? []) {
    const parsed = onboardingSchema.safeParse(raw);
    const clientId = parsed.success ? includedClient(parsed.data.clientId) : undefined;
    if (!parsed.success) {
      skipped.push({ kind: "onboarding", label: "Onboarding progress", reason: describeIssue(parsed.error) });
      continue;
    }
    // Progress for a demo or skipped client is left out with that client.
    if (!clientId) continue;
    if (onboarded.has(clientId)) continue; // One onboarding per client.
    onboarded.add(clientId);
    onboardings.push({ ...parsed.data, id: await mapId("onboarding", parsed.data.id), clientId, projectId: null });
  }

  const activity: ActivityEvent[] = [];
  let skippedActivity = 0;
  for (const raw of snapshot.activity) {
    const parsed = eventSchema.safeParse(raw);
    const entityId = parsed.success ? ids.get(`${parsed.data.entityType}:${parsed.data.entityId}`) : undefined;
    if (!parsed.success || !entityId) {
      skippedActivity++;
      continue;
    }
    activity.push({
      ...parsed.data,
      eventType: parsed.data.eventType as ActivityEvent["eventType"],
      id: await mapId("event", parsed.data.id),
      entityId,
      actor: imported(parsed.data.actor as Actor | undefined),
    });
  }

  const contextFields: Record<string, unknown>[] = [];
  const contextItems: Record<string, unknown>[] = [];
  for (const client of clients) {
    for (const key of CONTEXT_FIELD_KEYS) {
      const field: ContextField = client.context[key] ?? { value: null, confidence: "unknown", updatedAt: client.createdAt };
      contextFields.push(contextFieldRow(client.id, key, importedField(field)));
    }
    for (const item of client.contextItems) {
      contextItems.push(contextItemRow(client.id, { ...item, id: await mapId("item", item.id) }));
    }
  }

  const payload: ImportPlan["payload"] = {
    clients: clients.map(clientRow),
    context_fields: contextFields,
    context_items: contextItems,
    sources: sources.map(sourceRow),
    onboardings: onboardings.map(onboardingRow),
    projects: projects.map(projectRow),
    tasks: tasks.map(taskRow),
    activity: activity.map(eventRow),
  };

  return {
    hash: await sha256(JSON.stringify(payload)),
    payload,
    counts: { clients: clients.length, projects: projects.length, tasks: tasks.length, sources: sources.length, onboardings: onboardings.length, activity: activity.length },
    expected: { clients: clients.map((c) => c.id), projects: projects.map((p) => p.id), tasks: tasks.map((t) => t.id) },
    skipped,
    demoRecords,
    skippedActivity,
  };
}

/** Checks that every planned record can be read back from the server. */
export function verifyImport(plan: ImportPlan, snapshot: StudioSnapshot): { ok: boolean; missing: number } {
  const present = new Set([...snapshot.clients.map((c) => c.id), ...snapshot.projects.map((p) => p.id), ...snapshot.tasks.map((t) => t.id)]);
  const missing = [...plan.expected.clients, ...plan.expected.projects, ...plan.expected.tasks].filter((id) => !present.has(id)).length;
  return { ok: missing === 0, missing };
}

/** History from the browser keeps its names, marked as imported. Nobody is credited with it on the server. */
function imported(value: Actor | undefined): Actor | undefined {
  return value ? { ...value, imported: true } : undefined;
}

function importedField(field: ContextField): ContextField {
  const next: ContextField = { ...field, recordedBy: imported(field.recordedBy) };
  if (field.confidence === "confirmed") {
    const confirmedBy = field.confirmedBy ?? (field.recordedBy?.kind === "human" ? field.recordedBy : undefined);
    next.confirmedBy = { kind: "human", name: confirmedBy?.kind === "human" ? confirmedBy.name : "Earlier browser workspace", imported: true };
    next.confirmedAt = field.confirmedAt ?? field.updatedAt;
  }
  return next;
}

/** A UUID derived from the studio and the local id, so the same record always maps to the same row. */
export async function deterministicId(studioId: string, kind: string, localId: string): Promise<string> {
  const hex = await sha256(`studio-os-import:${studioId}:${kind}:${localId}`);
  // Version 8 (custom) UUID with the RFC 9562 variant.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function labelOf(raw: unknown, key: string): string {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>)[key] : undefined;
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 80) : "Unnamed record";
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  const path = issue?.path.join(".") || "record";
  return `${path} ${issue?.message ?? "is invalid"}`.replace(/^context\.(\w+)/, "brief value “$1”");
}

/* -------------------------------------------------------------------------- */
/* Remembering an import in this browser                                      */
/* -------------------------------------------------------------------------- */

export const IMPORT_MARKER_KEY = "studio-os:imported";

export interface ImportMarker {
  hash: string;
  batchId: string;
  at: string;
  verified: boolean;
}

export function readImportMarker(storage: Pick<Storage, "getItem"> | null, studioId: string): ImportMarker | null {
  try {
    const all = JSON.parse(storage?.getItem(IMPORT_MARKER_KEY) ?? "{}") as Record<string, ImportMarker>;
    return all[studioId] ?? null;
  } catch {
    return null;
  }
}

export function writeImportMarker(storage: Pick<Storage, "getItem" | "setItem"> | null, studioId: string, marker: ImportMarker) {
  try {
    const all = JSON.parse(storage?.getItem(IMPORT_MARKER_KEY) ?? "{}") as Record<string, ImportMarker>;
    storage?.setItem(IMPORT_MARKER_KEY, JSON.stringify({ ...all, [studioId]: marker }));
  } catch {
    // The server already refuses a second import of the same data.
  }
}

/* -------------------------------------------------------------------------- */
/* Sending it                                                                 */
/* -------------------------------------------------------------------------- */

export type ImportOutcome =
  | { status: "imported"; batchId: string; counts: Record<string, number> }
  | { status: "already_imported"; batchId: string; importedAt: string };

/** Writes the plan in one transaction. Importing the same data again changes nothing. */
export async function sendImport(client: SupabaseClient, studioId: string, plan: ImportPlan): Promise<ImportOutcome> {
  const { data, error } = await client.rpc("import_browser_data", { p_studio: studioId, p_hash: plan.hash, p_data: plan.payload });
  if (error) {
    if (error.code === "23505") {
      return { status: "already_imported", batchId: "", importedAt: new Date().toISOString() };
    }
    throw toRepositoryError(error);
  }
  return data as ImportOutcome;
}
