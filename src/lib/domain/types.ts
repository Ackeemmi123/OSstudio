/**
 * Core domain types for Studio OS.
 *
 * Client data is kept separate from project data so that one client can have
 * several projects over time. Context fields carry a confidence state so that
 * information extracted by people or (later) AI agents is never mistaken for a
 * confirmed client fact.
 */

export type ISODateString = string;

/* -------------------------------------------------------------------------- */
/* Data confidence and provenance                                             */
/* -------------------------------------------------------------------------- */

export const FIELD_CONFIDENCES = [
  "confirmed",
  "observed",
  "proposed",
  "unknown",
  "superseded",
] as const;

export type FieldConfidence = (typeof FIELD_CONFIDENCES)[number];

/** Where a piece of information came from. */
export interface SourceReference {
  type: SourceType;
  /** Human-readable label, e.g. "Intro email from Henrik" or "Kickoff call". */
  label?: string;
  /** Optional link to the original material. */
  url?: string;
}

export interface SupersededValue {
  value: string;
  confidence: FieldConfidence;
  supersededAt: ISODateString;
}

/**
 * A single piece of client context with provenance.
 * `value === null` means the information has not been established yet.
 */
export interface ContextField {
  value: string | null;
  confidence: FieldConfidence;
  source?: SourceReference;
  /** Why this value is believed, or what still needs checking. */
  note?: string;
  updatedAt: ISODateString;
  /** Earlier values that were replaced, newest first. */
  history?: SupersededValue[];
}

export const CONTEXT_FIELD_KEYS = [
  "goal",
  "targetAudience",
  "requirements",
  "budget",
  "deadline",
  "platform",
] as const;

export type ContextFieldKey = (typeof CONTEXT_FIELD_KEYS)[number];

export type ClientContext = Record<ContextFieldKey, ContextField>;

export type ContextItemKind = "assumption" | "question";

/** An assumption the team is working with, or an open question for the client. */
export interface ContextItem {
  id: string;
  kind: ContextItemKind;
  text: string;
  confidence: FieldConfidence;
  createdAt: ISODateString;
}

/* -------------------------------------------------------------------------- */
/* Clients                                                                    */
/* -------------------------------------------------------------------------- */

export const CLIENT_STATUSES = [
  "lead",
  "onboarding",
  "active",
  "on_hold",
  "archived",
] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const PROJECT_TYPES = [
  "website",
  "ecommerce",
  "brand_website",
  "website_ecommerce",
  "other",
] as const;

export type ProjectType = (typeof PROJECT_TYPES)[number];

export const SOURCE_TYPES = [
  "email",
  "contact_form",
  "meeting",
  "phone",
  "referral",
  "document",
  "manual",
  "other",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export interface ClientSource {
  type: SourceType;
  /** Free-form notes captured when the client was first recorded. */
  initialNotes: string | null;
  receivedAt: ISODateString;
}

export interface Client {
  id: string;
  name: string;
  contactPerson: string | null;
  email: string | null;
  website: string | null;
  status: ClientStatus;
  projectType: ProjectType | null;
  source: ClientSource;
  context: ClientContext;
  contextItems: ContextItem[];
  /** Marks seeded example records so they are never mistaken for real clients. */
  isDemo: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/* -------------------------------------------------------------------------- */
/* Projects and tasks                                                         */
/* -------------------------------------------------------------------------- */

export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_STAGES = [
  "intake",
  "discovery",
  "strategy",
  "design",
  "development",
  "review",
  "launch",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export interface Project {
  id: string;
  clientId: string;
  name: string;
  projectType: ProjectType;
  status: ProjectStatus;
  stage: ProjectStage;
  isDemo: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "blocked",
  "in_review",
  "awaiting_approval",
  "done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: string;
  projectId: string;
  title: string;
  status: TaskStatus;
  /** Team member name, or null when unassigned. */
  assignedTo: string | null;
  /** Short explanation shown for blocked tasks. */
  blockedReason?: string;
  dueDate?: ISODateString;
  isDemo: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

export type EntityType = "client" | "project" | "task";

export type ActivityEventType =
  | "client.created"
  | "client.updated"
  | "client.status_changed"
  | "project.created"
  | "project.stage_changed"
  | "task.created"
  | "task.status_changed"
  | "note.added";

export interface ActivityEvent {
  id: string;
  entityType: EntityType;
  entityId: string;
  eventType: ActivityEventType;
  description: string;
  /** Who made the change, when known. */
  actor?: string;
  timestamp: ISODateString;
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** Values captured by the "New client" form. Only `name` is required. */
export interface NewClientInput {
  name: string;
  contactPerson?: string;
  email?: string;
  website?: string;
  projectType?: ProjectType | "";
  goal?: string;
  budget?: string;
  deadline?: string;
  targetAudience?: string;
  initialNotes?: string;
  sourceType?: SourceType | "";
}

export interface ContextFieldInput {
  value: string;
  confidence: Exclude<FieldConfidence, "superseded">;
}

/** Values captured by the "Edit client" form. */
export interface ClientUpdateInput {
  name: string;
  contactPerson: string;
  email: string;
  website: string;
  status: ClientStatus;
  projectType: ProjectType | "";
  context: Record<ContextFieldKey, ContextFieldInput>;
}

export interface StudioSnapshot {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  activity: ActivityEvent[];
}
