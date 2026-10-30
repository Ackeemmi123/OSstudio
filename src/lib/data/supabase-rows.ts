/**
 * Converts between database rows (snake_case, as returned by load_studio) and
 * domain objects. Pure functions, so they are unit tested without a database.
 *
 * Timestamps are kept exactly as the database returned them: updates send the
 * last-seen `updated_at` back to detect concurrent edits.
 */
import type { AgentRunRecord } from "@/lib/agents/contract";
import {
  CONTEXT_FIELD_KEYS,
  type ActivityEvent,
  type Actor,
  type AgentProposal,
  type Client,
  type ClientContext,
  type ContextField,
  type ContextFieldKey,
  type ContextItem,
  type Inquiry,
  type Onboarding,
  type Project,
  type RetentionHoldEntry,
  type SiteAssetRecord,
  type SiteSpecRecord,
  type SourceDocument,
  type StudioSnapshot,
  type Task,
} from "@/lib/domain/types";
import type { MemberRole, StudioMember } from "./repository";

type Row = Record<string, unknown>;

export interface StudioPayload {
  studio: { id: string; name: string };
  role: MemberRole;
  members: StudioMember[];
  clients: Row[];
  context_fields: Row[];
  context_items: Row[];
  sources: Row[];
  projects: Row[];
  tasks: Row[];
  activity: Row[];
  agent_runs: Row[];
  proposals: Row[];
  /** Read from client_onboardings next to load_studio. */
  onboardings?: Row[];
  /** Read from inquiries next to load_studio. */
  inquiries?: Row[];
  /** Each client's retention dates (client retention migration). */
  retention?: Row[];
  retention_holds?: Row[];
}

/** The inquiry columns the app reads. The content hash and submission id stay in the database. */
export const INQUIRY_COLUMNS =
  "id, status, is_test, locale, contact_name, email, company, website, service, project_type, budget_range, budget_amount_eur, " +
  "timeline, desired_date, message, received_at, client_id, created_client, decided_by, decided_at, decision_reason, repeat_of";

const str = (value: unknown): string => String(value);
const opt = (value: unknown): string | null => (value == null ? null : String(value));
const actor = (value: unknown): Actor | undefined => (value && typeof value === "object" ? (value as Actor) : undefined);

/* -------------------------------------------------------------------------- */
/* Rows → domain                                                              */
/* -------------------------------------------------------------------------- */

export function toSnapshot(payload: StudioPayload): StudioSnapshot {
  const fields = new Map<string, Row[]>();
  for (const row of payload.context_fields) {
    const list = fields.get(str(row.client_id)) ?? [];
    list.push(row);
    fields.set(str(row.client_id), list);
  }
  const items = new Map<string, ContextItem[]>();
  for (const row of payload.context_items) {
    const list = items.get(str(row.client_id)) ?? [];
    list.push({ id: str(row.id), kind: row.kind as ContextItem["kind"], text: str(row.text), confidence: row.confidence as ContextItem["confidence"], createdAt: str(row.created_at) });
    items.set(str(row.client_id), list);
  }

  const retention = new Map((payload.retention ?? []).map((row) => [str(row.clientId), row]));
  const holds = new Map<string, RetentionHoldEntry[]>();
  for (const row of payload.retention_holds ?? []) {
    const list = holds.get(str(row.client_id)) ?? [];
    list.push({ action: row.action as RetentionHoldEntry["action"], reason: opt(row.reason), actor: row.actor as Actor, at: str(row.created_at) });
    holds.set(str(row.client_id), list);
  }

  return {
    clients: payload.clients.map((row) => {
      const client = toClient(row, fields.get(str(row.id)) ?? [], items.get(str(row.id)) ?? []);
      const dates = retention.get(client.id);
      if (!dates) return client;
      return {
        ...client,
        retention: {
          customer: Boolean(dates.customer),
          lastActivityAt: str(dates.lastActivityAt),
          endsAt: opt(dates.endsAt),
          hold: row.retention_hold_reason == null ? null : { reason: str(row.retention_hold_reason), by: row.retention_hold_by as Actor, at: str(row.retention_held_at) },
          log: holds.get(client.id) ?? [],
        },
      };
    }),
    projects: payload.projects.map(toProject),
    tasks: payload.tasks.map(toTask),
    activity: payload.activity.map(toEvent),
    sources: payload.sources.map(toSource),
    agentRuns: payload.agent_runs.map(toAgentRun),
    proposals: payload.proposals.map(toProposal),
    onboardings: (payload.onboardings ?? []).map(toOnboarding),
    inquiries: (payload.inquiries ?? []).map(toInquiry),
  };
}

export function toInquiry(row: Row): Inquiry {
  return {
    id: str(row.id),
    status: row.status as Inquiry["status"],
    isTest: Boolean(row.is_test),
    locale: row.locale as Inquiry["locale"],
    contactName: str(row.contact_name),
    email: str(row.email),
    company: opt(row.company),
    website: opt(row.website),
    service: row.service as Inquiry["service"],
    projectType: (row.project_type as Inquiry["projectType"]) ?? null,
    budget: (row.budget_range as Inquiry["budget"]) ?? null,
    budgetAmount: row.budget_amount_eur == null ? null : Number(row.budget_amount_eur),
    timeline: (row.timeline as Inquiry["timeline"]) ?? null,
    desiredDate: opt(row.desired_date),
    message: str(row.message),
    receivedAt: str(row.received_at),
    clientId: opt(row.client_id),
    createdClient: Boolean(row.created_client),
    decidedBy: actor(row.decided_by) ?? null,
    decidedAt: opt(row.decided_at),
    decisionReason: opt(row.decision_reason),
    repeatOf: opt(row.repeat_of),
  };
}

export function toOnboarding(row: Row): Onboarding {
  return {
    id: str(row.id),
    clientId: str(row.client_id),
    projectId: opt(row.project_id),
    status: row.status as Onboarding["status"],
    currentStep: row.current_step as Onboarding["currentStep"],
    skipped: Array.isArray(row.skipped) ? (row.skipped as Onboarding["skipped"]) : [],
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
    completedAt: opt(row.completed_at),
  };
}

/** The site_assets columns the app reads (not the checksum or purge time). */
export const SITE_ASSET_COLUMNS =
  "id, client_id, storage_path, mime_type, byte_size, width, height, description, source_note, rights_basis, licence_note, use_permitted, use_permission_note, " +
  "identifiable_people, people_basis, people_basis_note, status, uploaded_by, reviewed_by, reviewed_at, review_note, created_at, updated_at";

export function toSiteAssetRecord(row: Row): SiteAssetRecord {
  return {
    id: str(row.id),
    clientId: str(row.client_id),
    storagePath: str(row.storage_path),
    mimeType: str(row.mime_type),
    byteSize: Number(row.byte_size),
    width: Number(row.width),
    height: Number(row.height),
    description: str(row.description ?? ""),
    sourceNote: str(row.source_note ?? ""),
    rightsBasis: (row.rights_basis ?? null) as SiteAssetRecord["rightsBasis"],
    licenceNote: str(row.licence_note ?? ""),
    usePermitted: row.use_permitted === true,
    usePermissionNote: str(row.use_permission_note ?? ""),
    identifiablePeople: row.identifiable_people === true,
    peopleBasis: (row.people_basis ?? null) as SiteAssetRecord["peopleBasis"],
    peopleBasisNote: str(row.people_basis_note ?? ""),
    status: row.status as SiteAssetRecord["status"],
    uploadedBy: row.uploaded_by as Actor,
    reviewedBy: actor(row.reviewed_by) ?? null,
    reviewedAt: opt(row.reviewed_at),
    reviewNote: opt(row.review_note),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/** The site_specs columns the app reads. */
export const SITE_SPEC_COLUMNS =
  "id, client_id, project_id, version, based_on, status, spec, created_by, submitted_by, submitted_at, approved_by, approved_at, review_note, created_at, updated_at";

export function toSiteSpecRecord(row: Row): SiteSpecRecord {
  return {
    id: str(row.id),
    clientId: str(row.client_id),
    projectId: str(row.project_id),
    version: Number(row.version),
    basedOn: opt(row.based_on),
    status: row.status as SiteSpecRecord["status"],
    spec: row.spec as SiteSpecRecord["spec"],
    createdBy: row.created_by as Actor,
    submittedBy: actor(row.submitted_by) ?? null,
    submittedAt: opt(row.submitted_at),
    approvedBy: actor(row.approved_by) ?? null,
    approvedAt: opt(row.approved_at),
    reviewNote: opt(row.review_note),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

/** What the app writes. Times are set by the database. */
export function siteSpecRow(record: SiteSpecRecord): Row {
  return {
    id: record.id,
    client_id: record.clientId,
    project_id: record.projectId,
    version: record.version,
    based_on: record.basedOn,
    status: record.status,
    spec: record.spec,
    created_by: record.createdBy,
    submitted_by: record.submittedBy,
    approved_by: record.approvedBy,
    review_note: record.reviewNote,
  };
}

function toClient(row: Row, fieldRows: Row[], contextItems: ContextItem[]): Client {
  const byKey = new Map(fieldRows.map((field) => [str(field.field_key), field]));
  const context = Object.fromEntries(
    CONTEXT_FIELD_KEYS.map((key) => {
      const field = byKey.get(key);
      return [key, field ? toContextField(field) : { value: null, confidence: "unknown", updatedAt: str(row.created_at) }];
    }),
  ) as ClientContext;

  return {
    id: str(row.id),
    name: str(row.name),
    contactPerson: opt(row.contact_person),
    email: opt(row.email),
    website: opt(row.website),
    status: row.status as Client["status"],
    projectType: (row.project_type as Client["projectType"]) ?? null,
    source: { type: row.source_type as Client["source"]["type"], initialNotes: opt(row.initial_notes), receivedAt: str(row.source_received_at) },
    context,
    contextItems,
    isDemo: Boolean(row.is_demo),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function toContextField(row: Row): ContextField {
  const field: ContextField = {
    value: opt(row.value),
    confidence: row.confidence as ContextField["confidence"],
    updatedAt: str(row.updated_at),
  };
  if (row.source) field.source = row.source as ContextField["source"];
  if (row.note) field.note = str(row.note);
  if (row.recorded_by) field.recordedBy = actor(row.recorded_by);
  if (row.confirmed_by) field.confirmedBy = actor(row.confirmed_by);
  if (row.confirmed_at) field.confirmedAt = str(row.confirmed_at);
  if (Array.isArray(row.history) && row.history.length) field.history = row.history as ContextField["history"];
  return field;
}

function toProject(row: Row): Project {
  return {
    id: str(row.id),
    clientId: str(row.client_id),
    name: str(row.name),
    projectType: row.project_type as Project["projectType"],
    status: row.status as Project["status"],
    stage: row.stage as Project["stage"],
    isDemo: Boolean(row.is_demo),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
}

function toTask(row: Row): Task {
  const task: Task = {
    id: str(row.id),
    projectId: str(row.project_id),
    title: str(row.title),
    status: row.status as Task["status"],
    assignee: (row.assignee as Task["assignee"]) ?? null,
    isDemo: Boolean(row.is_demo),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  };
  if (row.blocked_reason) task.blockedReason = str(row.blocked_reason);
  if (row.due_date) task.dueDate = str(row.due_date);
  return task;
}

function toEvent(row: Row): ActivityEvent {
  return {
    id: str(row.id),
    entityType: row.entity_type as ActivityEvent["entityType"],
    entityId: str(row.entity_id),
    eventType: row.event_type as ActivityEvent["eventType"],
    description: str(row.description),
    actor: actor(row.actor),
    timestamp: str(row.timestamp),
  };
}

export function toSource(row: Row): SourceDocument {
  return {
    id: str(row.id),
    clientId: str(row.client_id),
    type: row.type as SourceDocument["type"],
    label: str(row.label),
    content: str(row.content),
    receivedAt: str(row.received_at),
    addedBy: actor(row.added_by),
  };
}

export function toAgentRun(row: Row): AgentRunRecord {
  return {
    id: str(row.id),
    agentId: row.agent as AgentRunRecord["agentId"],
    taskType: row.task_type as AgentRunRecord["taskType"],
    clientId: str(row.client_id),
    projectId: opt(row.project_id),
    taskId: opt(row.task_id),
    idempotencyKey: str(row.idempotency_key),
    attempt: Number(row.attempt),
    status: row.status as AgentRunRecord["status"],
    trigger: row.trigger as AgentRunRecord["trigger"],
    inputs: (row.inputs as AgentRunRecord["inputs"]) ?? [],
    outputs: (row.outputs as AgentRunRecord["outputs"]) ?? [],
    result: (row.result as AgentRunRecord["result"]) ?? null,
    blocker: opt(row.blocker),
    error: (row.error as AgentRunRecord["error"]) ?? null,
    runner: opt(row.runner),
    model: opt(row.model),
    promptVersion: opt(row.prompt_version),
    servedBy: opt(row.served_by),
    usage:
      row.input_tokens == null || row.output_tokens == null
        ? null
        : {
            inputTokens: Number(row.input_tokens),
            outputTokens: Number(row.output_tokens),
            cacheReadTokens: Number(row.cache_read_tokens ?? 0),
            cacheWriteTokens: Number(row.cache_write_tokens ?? 0),
          },
    costMicros: row.cost_micros == null ? null : Number(row.cost_micros),
    createdAt: str(row.created_at),
    startedAt: opt(row.started_at),
    finishedAt: opt(row.finished_at),
  };
}

export function toProposal(row: Row): AgentProposal {
  return {
    id: str(row.id),
    runId: str(row.run_id),
    clientId: str(row.client_id),
    target: row.target as AgentProposal["target"],
    value: str(row.value),
    evidence: (row.evidence as AgentProposal["evidence"]) ?? [],
    note: opt(row.note),
    status: row.status as AgentProposal["status"],
    reviewConfidence: (row.review_confidence as AgentProposal["reviewConfidence"]) ?? null,
    reviewedBy: actor(row.reviewed_by) ?? null,
    reviewedAt: opt(row.reviewed_at),
    createdAt: str(row.created_at),
  };
}

/* -------------------------------------------------------------------------- */
/* Domain → rows                                                              */
/* -------------------------------------------------------------------------- */

export function clientRow(client: Client): Row {
  return {
    id: client.id,
    name: client.name,
    contact_person: client.contactPerson,
    email: client.email,
    website: client.website,
    status: client.status,
    project_type: client.projectType,
    source_type: client.source.type,
    initial_notes: client.source.initialNotes,
    source_received_at: client.source.receivedAt,
    is_demo: client.isDemo,
    created_at: client.createdAt,
    updated_at: client.updatedAt,
  };
}

export function contextFieldRow(clientId: string, key: ContextFieldKey, field: ContextField): Row {
  return {
    client_id: clientId,
    field_key: key,
    value: field.value,
    confidence: field.confidence,
    source: field.source ?? null,
    note: field.note ?? null,
    recorded_by: field.recordedBy ?? null,
    confirmed_by: field.confirmedBy ?? null,
    confirmed_at: field.confirmedAt ?? null,
    history: field.history ?? [],
    updated_at: field.updatedAt,
  };
}

export function contextItemRow(clientId: string, item: ContextItem): Row {
  return { id: item.id, client_id: clientId, kind: item.kind, text: item.text, confidence: item.confidence, created_at: item.createdAt };
}

export function sourceRow(source: SourceDocument): Row {
  return {
    id: source.id,
    client_id: source.clientId,
    type: source.type,
    label: source.label,
    content: source.content,
    received_at: source.receivedAt,
    added_by: source.addedBy ?? null,
    created_at: source.receivedAt,
  };
}

export function onboardingRow(onboarding: Onboarding): Row {
  return {
    id: onboarding.id,
    client_id: onboarding.clientId,
    project_id: onboarding.projectId,
    status: onboarding.status,
    current_step: onboarding.currentStep,
    skipped: onboarding.skipped,
    created_at: onboarding.createdAt,
    updated_at: onboarding.updatedAt,
    completed_at: onboarding.completedAt,
  };
}

export function projectRow(project: Project): Row {
  return {
    id: project.id,
    client_id: project.clientId,
    name: project.name,
    project_type: project.projectType,
    status: project.status,
    stage: project.stage,
    is_demo: project.isDemo,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
  };
}

export function taskRow(task: Task): Row {
  return {
    id: task.id,
    project_id: task.projectId,
    title: task.title,
    status: task.status,
    assignee: task.assignee,
    blocked_reason: task.blockedReason ?? null,
    due_date: task.dueDate ? task.dueDate.slice(0, 10) : null,
    is_demo: task.isDemo,
    created_at: task.createdAt,
    updated_at: task.updatedAt,
  };
}

export function eventRow(event: ActivityEvent): Row {
  return {
    id: event.id,
    entity_type: event.entityType,
    entity_id: event.entityId,
    event_type: event.eventType,
    description: event.description,
    actor: event.actor ?? null,
    timestamp: event.timestamp,
  };
}
