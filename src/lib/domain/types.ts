/**
 * Core domain types for Studio OS.
 *
 * One client has many projects; a project has tasks. Client context fields
 * carry a confidence state and provenance so that information recorded by
 * people or (later) AI agents is never mistaken for a confirmed client fact.
 */

import type { AgentRunRecord } from "@/lib/agents/contract";

export type ISODateString = string;

/* -------------------------------------------------------------------------- */
/* Actors                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Specialized agents the studio plans to run. Declared in the domain because
 * tasks, events and context values can reference them; their capabilities and
 * permissions live in `src/lib/agents`.
 */
export const AGENT_IDS = ["research", "design", "development", "qa", "sales", "coordination"] as const;
export type AgentId = (typeof AGENT_IDS)[number];

/**
 * Who did something. Agents are never treated as an authorized human.
 * `userId` is the signed-in account (absent in the local demo); `imported`
 * marks history brought over from the browser demo.
 */
export type Actor =
  | { kind: "human"; name: string; userId?: string; imported?: boolean }
  | { kind: "agent"; agentId: AgentId }
  | { kind: "system" };

/** Who a task is assigned to. */
export type Assignee = { kind: "human"; name: string } | { kind: "agent"; agentId: AgentId };

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
  /** Who recorded the current value. */
  recordedBy?: Actor;
  /** The person who confirmed the current value. Always a person, never an agent. */
  confirmedBy?: Actor;
  confirmedAt?: ISODateString;
  updatedAt: ISODateString;
  /** Earlier values that were replaced, newest first. */
  history?: SupersededValue[];
}

export const CONTEXT_FIELD_KEYS = [
  "goal",
  "requirements",
  "targetAudience",
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
  /** What the client asked for before any project exists. */
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

/** Whether the engagement is running. Independent of task status. */
export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Where the engagement is in the studio's delivery process. */
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
  /** A team member or an agent, or null when unassigned. */
  assignee: Assignee | null;
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

/**
 * The activity log doubles as the workflow event stream: future automations
 * subscribe to these types (see `src/lib/agents/triggers.ts`).
 */
export type ActivityEventType =
  | "client.created"
  | "client.updated"
  | "client.status_changed"
  | "client.context_updated"
  | "source.received"
  | "project.created"
  | "project.updated"
  | "project.stage_changed"
  | "task.created"
  | "task.status_changed"
  | "task.completed"
  | "decision.approved"
  | "note.added"
  | "agent.run_started"
  | "agent.run_completed"
  | "agent.run_failed"
  | "agent.proposal_accepted"
  | "agent.proposal_dismissed";

export interface ActivityEvent {
  id: string;
  entityType: EntityType;
  entityId: string;
  eventType: ActivityEventType;
  description: string;
  /** Who made the change, when known. */
  actor?: Actor;
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

/** Identity and relationship details, edited together. */
export interface ClientDetailsInput {
  name: string;
  contactPerson: string;
  email: string;
  website: string;
  status: ClientStatus;
  projectType: ProjectType | "";
}

/** One context value, edited on its own. */
export interface ContextFieldInput {
  value: string;
  confidence: Exclude<FieldConfidence, "superseded" | "unknown">;
  /** Where the value came from. Defaults to "Edited in Studio OS". */
  source?: SourceReference;
  note?: string;
}

export interface NewContextItemInput {
  kind: ContextItemKind;
  text: string;
}

export interface NewSourceInput {
  type: SourceType;
  label: string;
  content: string;
}

export interface NewProjectInput {
  name: string;
  projectType?: ProjectType;
}

export interface ProjectUpdateInput {
  status?: ProjectStatus;
  stage?: ProjectStage;
}

export interface NewTaskInput {
  title: string;
}

/* -------------------------------------------------------------------------- */
/* Source material                                                            */
/* -------------------------------------------------------------------------- */

export const SOURCE_CONTENT_MAX_LENGTH = 50_000;

/** Material a person supplied about a client: an email, call notes, a brief. */
export interface SourceDocument {
  id: string;
  clientId: string;
  type: SourceType;
  label: string;
  content: string;
  receivedAt: ISODateString;
  addedBy?: Actor;
}

/* -------------------------------------------------------------------------- */
/* Agent runs and proposals                                                   */
/* -------------------------------------------------------------------------- */

/** What an agent may propose a value for: a brief value or a client detail. */
export const PROPOSAL_TARGETS = [
  ...CONTEXT_FIELD_KEYS,
  "companyName",
  "contactPerson",
  "email",
  "website",
] as const;
export type ProposalTarget = (typeof PROPOSAL_TARGETS)[number];

export interface Evidence {
  sourceId: string;
  sourceLabel: string;
  /** Text quoted verbatim from the source, checked before the proposal is stored. */
  quote: string;
}

export type ProposalStatus = "pending" | "accepted" | "dismissed" | "superseded";

/** A value an agent found in source material. Nothing changes until a person accepts it. */
export interface AgentProposal {
  id: string;
  runId: string;
  clientId: string;
  target: ProposalTarget;
  value: string;
  evidence: Evidence[];
  /** Why the value may need checking. */
  note: string | null;
  status: ProposalStatus;
  reviewConfidence: "observed" | "confirmed" | null;
  reviewedBy: Actor | null;
  reviewedAt: ISODateString | null;
  createdAt: ISODateString;
}

export type ProposalDecision = { action: "accept"; confidence: "observed" | "confirmed" } | { action: "dismiss" };

export interface StudioSnapshot {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  activity: ActivityEvent[];
  sources: SourceDocument[];
  agentRuns: AgentRunRecord[];
  proposals: AgentProposal[];
}
