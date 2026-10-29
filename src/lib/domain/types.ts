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
  | { kind: "agent"; agentId: AgentId; imported?: boolean }
  | { kind: "system"; imported?: boolean };

/** Who a task is assigned to. `userId` is set when the person is a studio member. */
export type Assignee = { kind: "human"; name: string; userId?: string } | { kind: "agent"; agentId: AgentId };

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
  /** The website inquiry the value came from, when it did. */
  inquiryId?: string;
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

/**
 * Every structured fact the brief can hold. Labels, grouping, onboarding
 * questions and when each one applies live in `brief.ts`. New keys are added
 * to stored data as "unknown" by `migrateSnapshot`.
 */
export const CONTEXT_FIELD_KEYS = [
  // Business overview
  "industry",
  "offering",
  // Current setup
  "salesChannels",
  "platform",
  "storeUrl",
  "integrations",
  // Goals and audience
  "goal",
  "targetAudience",
  "challenges",
  "outcomes",
  // Scope and requirements
  "requirements",
  "designPreferences",
  "content",
  "technicalConstraints",
  "existingMaterials",
  // Budget and timing
  "budget",
  "deadline",
  "dependencies",
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
  /** When the database will anonymise this client. Only a signed-in workspace has it; never in the local demo. */
  retention?: ClientRetention;
}

/**
 * Worked out by the database from the client's history (see
 * supabase/migrations/20261029000200_client_retention.sql): never a customer,
 * 12 months after the last activity; a customer, 3 years after archiving or
 * after 12 months without activity, whichever comes first.
 */
export interface ClientRetention {
  /** Reached Active at least once. */
  customer: boolean;
  /** The last change a person made to the client, its projects or tasks. */
  lastActivityAt: ISODateString;
  /** Null while an owner holds it. */
  endsAt: ISODateString | null;
  hold: { reason: string; by: Actor; at: ISODateString } | null;
  /** Every hold and release, oldest first. */
  log: RetentionHoldEntry[];
}

export interface RetentionHoldEntry {
  action: "hold" | "release";
  reason: string | null;
  actor: Actor;
  at: ISODateString;
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
 * subscribe to these types through `src/lib/agents/triggers.ts`.
 */
export type ActivityEventType =
  | "client.created"
  | "onboarding.started"
  | "onboarding.ready_for_review"
  | "client.updated"
  | "client.status_changed"
  | "client.context_updated"
  | "source.received"
  | "project.created"
  | "project.updated"
  | "project.stage_changed"
  | "task.created"
  | "task.status_changed"
  | "task.updated"
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
  /** Task titles to create with the project, usually from its playbook. */
  tasks?: string[];
}

export interface ProjectUpdateInput {
  status?: ProjectStatus;
  stage?: ProjectStage;
}

export interface NewTaskInput {
  title: string;
}

/** Owner and due date, edited together. Empty values clear them. */
export interface TaskDetailsInput {
  /** A person's name, or "" for unassigned. */
  ownerName: string;
  /** The studio member, when the owner is one. */
  ownerUserId?: string;
  /** YYYY-MM-DD, or "". */
  dueDate: string;
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

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                 */
/* -------------------------------------------------------------------------- */

export const ONBOARDING_STEPS = ["business", "setup", "goals", "scope", "timeline", "review"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** draft: started, nothing answered. in_progress: answers saved. ready_for_review: a person finished the guided pass. */
export const ONBOARDING_STATUSES = ["draft", "in_progress", "ready_for_review"] as const;
export type OnboardingStatus = (typeof ONBOARDING_STATUSES)[number];

/**
 * Progress through the guided onboarding. Holds no answers: every answer is
 * written to the client's details or brief, which stay the one source of truth.
 */
export interface Onboarding {
  id: string;
  clientId: string;
  /** The project this onboarding scopes, once one exists. Null for a new lead. */
  projectId: string | null;
  status: OnboardingStatus;
  currentStep: OnboardingStep;
  /** Questions a person marked as not known yet, so they are not asked again. */
  skipped: ContextFieldKey[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  completedAt: ISODateString | null;
}

/** One save of an onboarding step. Only values that differ from the brief are written. */
export interface OnboardingStepInput {
  /** Where the person goes next. */
  nextStep: OnboardingStep;
  details?: Partial<Pick<ClientDetailsInput, "contactPerson" | "email" | "website" | "projectType">>;
  /** Values typed by a person. An empty value clears the field. */
  answers?: Partial<Record<ContextFieldKey, string>>;
  /** How sure the person is of the values typed in this step. */
  answerConfidence?: "observed" | "confirmed";
  /** Existing observed values the person confirms as they are. */
  confirm?: ContextFieldKey[];
  /**
   * The brief value the person saw for each answered or confirmed question
   * (null: unknown). If the brief changed since, the step is refused, so a
   * newer or confirmed value is never overwritten or confirmed unseen.
   */
  seen?: Partial<Record<ContextFieldKey, string | null>>;
  /** Questions to mark as not known yet. */
  skip?: ContextFieldKey[];
  /** Open questions for the client. */
  questions?: string[];
}

/* -------------------------------------------------------------------------- */
/* Website inquiries                                                          */
/* -------------------------------------------------------------------------- */

export const INQUIRY_STATUSES = ["new", "approved", "rejected", "spam", "merged"] as const;
export type InquiryStatus = (typeof INQUIRY_STATUSES)[number];

/**
 * What a prospective customer sent through the Axivo website, as stored by
 * POST /api/inquiries. The submitted fields never change; only the decision
 * does, once, by a person. Ids match the contract in src/lib/inquiries/contract.ts.
 */
export interface Inquiry {
  id: string;
  status: InquiryStatus;
  isTest: boolean;
  locale: "en" | "sv" | "fi";
  contactName: string;
  email: string;
  company: string | null;
  website: string | null;
  service: "websites" | "marketing" | "other";
  projectType: "website" | "ecommerce" | "website_ecommerce" | "brand_website" | "not_sure" | null;
  budget: "under_1k" | "1k_3k" | "3k_5k" | "5k_10k" | "over_10k" | "not_sure" | "custom" | null;
  /** Whole euros, only with budget "custom". */
  budgetAmount: number | null;
  timeline: "asap" | "within_3_months" | "3_6_months" | "flexible" | null;
  /** YYYY-MM-DD. */
  desiredDate: string | null;
  message: string;
  receivedAt: ISODateString;
  /** The client it became or was added to, once approved. */
  clientId: string | null;
  createdClient: boolean;
  decidedBy: Actor | null;
  decidedAt: ISODateString | null;
  /** Internal reason for a rejection. Never shown to the customer. */
  decisionReason: string | null;
  /**
   * The first inquiry from the same address, when this one arrived while that
   * one was still open. A repeat is decided together with its first inquiry.
   */
  repeatOf: string | null;
}

/** A person's decision on a new inquiry. */
export type InquiryDecision =
  /** Create a client (under this name) and start its onboarding. */
  | { action: "approve"; name: string }
  /** Add the inquiry to a client that already exists. */
  | { action: "link"; clientId: string }
  | { action: "reject"; reason?: string }
  | { action: "spam" };

export interface StudioSnapshot {
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  activity: ActivityEvent[];
  sources: SourceDocument[];
  agentRuns: AgentRunRecord[];
  proposals: AgentProposal[];
  onboardings: Onboarding[];
  /** Website inquiries. Only a signed-in workspace receives them; always empty in the local demo. */
  inquiries: Inquiry[];
}
