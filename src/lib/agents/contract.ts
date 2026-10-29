/**
 * The contract every agent run follows, independent of which model provider
 * executes it.
 *
 * A run records what the agent was given (input references), what it
 * produced (output references and a structured result), its status, and who
 * asked for it, so that a person can always see what an agent worked on and
 * what needs their decision.
 */
import type { ActivityEventType, AgentId, ISODateString, ProposalTarget } from "@/lib/domain/types";
import type { AgentAction } from "./permissions";
import type { TokenUsage } from "./pricing";

/** A pointer to a record in the shared studio data. Agents never keep their own copy of client context. */
export type EntityRef =
  | { type: "client"; id: string }
  | { type: "project"; id: string }
  | { type: "task"; id: string }
  | { type: "context_field"; clientId: string; key: string }
  | { type: "source"; id: string; label?: string }
  | { type: "proposal"; id: string }
  | { type: "artifact"; id: string; label?: string; url?: string };

export const AGENT_TASK_TYPES = [
  "research.intake",
  "research.competitors",
  "design.direction",
  "design.review",
  "development.build",
  "qa.review",
  "sales.proposal_draft",
  "coordination.plan",
] as const;
export type AgentTaskType = (typeof AGENT_TASK_TYPES)[number];

export const AGENT_RUN_STATUSES = [
  "queued",
  "running",
  /** Stopped because it lacks information. `blocker` says what. */
  "needs_input",
  /** Produced something that a person must review before it takes effect. */
  "needs_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type AgentRunStatus = (typeof AGENT_RUN_STATUSES)[number];

export type AgentTrigger =
  | { kind: "manual"; requestedBy: string }
  | { kind: "event"; eventId: string; eventType: ActivityEventType };

/** A durable record of one attempt. Stored so runs can be audited, retried and explained. */
export interface AgentRunRecord {
  id: string;
  agentId: AgentId;
  taskType: AgentTaskType;
  clientId: string;
  projectId: string | null;
  taskId: string | null;
  /** Identical inputs give the same key, so a repeated request reuses the run. */
  idempotencyKey: string;
  attempt: number;
  status: AgentRunStatus;
  trigger: AgentTrigger;
  inputs: EntityRef[];
  outputs: EntityRef[];
  result: IntakeResult | null;
  /** Why the run stopped, in plain language. */
  blocker: string | null;
  error: { message: string; retryable: boolean } | null;
  /** Which implementation ran it, e.g. "anthropic". Never a credential. */
  runner: string | null;
  model: string | null;
  /** Which version of the agent's instructions the run used. */
  promptVersion: string | null;
  /** The model that answered, which can differ from `model` after a provider fallback. */
  servedBy: string | null;
  /** Tokens the provider reported. Null when no call was made or the provider did not say. */
  usage: TokenUsage | null;
  /** Estimated cost in micro-dollars (see pricing.ts). Null when unknown. */
  costMicros: number | null;
  createdAt: ISODateString;
  startedAt: ISODateString | null;
  finishedAt: ISODateString | null;
}

/** Statuses after which a run will not change again. */
export function isFinished(status: AgentRunStatus): boolean {
  return status !== "queued" && status !== "running";
}

/* -------------------------------------------------------------------------- */
/* Client Intake & Research                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What the intake agent produced besides its proposals. Every item is about
 * the supplied material only: the agent does not browse or research.
 */
export interface IntakeResult {
  /** A short, structured brief in plain language. */
  summary: string;
  /** Essentials the material does not establish. */
  missing: { target: ProposalTarget | null; description: string }[];
  /** Statements that are vague or contradict each other. */
  ambiguities: { description: string; sourceId: string | null; quote: string | null }[];
  /** Questions worth asking the client. */
  questions: string[];
  /**
   * The brief field each question would fill, by position in `questions`, or
   * null when it is about something else. Missing on runs before 31 Oct 2026.
   */
  questionTargets?: (ProposalTarget | null)[];
  /** What the studio could do next. Suggestions, not decisions. */
  nextSteps: string[];
  /** The material that was analyzed. */
  analyzedSources: { id: string; label: string; characters: number }[];
  /** Proposals dropped because their quoted evidence was not found in the source. */
  discardedProposals: number;
  /** Always false for this agent; shown so nobody assumes otherwise. */
  externalResearch: false;
}

/** Actions a run wants to take that need a person to approve first. */
export interface PendingApproval {
  action: AgentAction;
  summary: string;
}

export function intakeIdempotencyKey(clientId: string, inputFingerprint: string): string {
  return `research.intake:${clientId}:${inputFingerprint}`;
}
