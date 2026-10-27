/**
 * The contract every future agent run follows, independent of which model
 * provider or agent framework executes it.
 *
 * Nothing in the app executes agents yet. These types define what a run must
 * record so that a person can always see what an agent worked on, what it was
 * given, what it produced, and whether a human decision is needed.
 */
import type { ActivityEvent, AgentId, ISODateString } from "@/lib/domain/types";
import type { AgentAction } from "./permissions";

/** A pointer to a record in the shared studio data. Agents never keep their own copy of client context. */
export type EntityRef =
  | { type: "client"; id: string }
  | { type: "project"; id: string }
  | { type: "task"; id: string }
  | { type: "context_field"; clientId: string; key: string }
  | { type: "source"; id: string; label?: string }
  | { type: "artifact"; id: string; label?: string; url?: string };

export const AGENT_TASK_TYPES = [
  "research.brief",
  "research.competitors",
  "design.direction",
  "design.review",
  "development.build",
  "qa.review",
  "sales.proposal_draft",
  "coordination.plan",
] as const;
export type AgentTaskType = (typeof AGENT_TASK_TYPES)[number];

export type AgentRunStatus =
  | "queued"
  | "running"
  /** Stopped because it lacks information. `blocker` says what. */
  | "needs_input"
  /** Produced something that a person must approve before it takes effect. */
  | "needs_approval"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AgentRunRequest {
  taskType: AgentTaskType;
  agentId: AgentId;
  clientId: string;
  projectId: string | null;
  /** The studio task this run belongs to, when there is one. */
  taskId: string | null;
  inputs: EntityRef[];
  /** What triggered the run, for traceability. */
  trigger: { kind: "manual"; requestedBy: string } | { kind: "event"; eventId: string; eventType: ActivityEvent["eventType"] };
}

/** A durable record of one attempt. Stored so runs can be audited, retried and explained. */
export interface AgentRun extends AgentRunRequest {
  id: string;
  /** The same request retried keeps its key, so a retry never duplicates work. */
  idempotencyKey: string;
  attempt: number;
  status: AgentRunStatus;
  outputs: EntityRef[];
  /** Why the run stopped, in plain language. */
  blocker?: string;
  error?: { message: string; retryable: boolean };
  /** Actions the run wants to take that need a person to approve first. */
  pendingApprovals: { action: AgentAction; summary: string }[];
  /** Which implementation ran it, e.g. "anthropic:claude" or "local-script". Never a credential. */
  runner?: string;
  createdAt: ISODateString;
  startedAt?: ISODateString;
  finishedAt?: ISODateString;
}

export type AgentRunResult =
  | { status: "succeeded"; outputs: EntityRef[] }
  | { status: "needs_input"; blocker: string; outputs?: EntityRef[] }
  | { status: "needs_approval"; outputs: EntityRef[]; pendingApprovals: AgentRun["pendingApprovals"] }
  | { status: "failed"; error: { message: string; retryable: boolean } };

/**
 * Implemented once per provider or framework, server-side only. Runners
 * receive references, not secrets, and write results back through the same
 * repository the UI uses, so every agent shares one version of the truth.
 */
export interface AgentRunner {
  readonly id: string;
  canRun(taskType: AgentTaskType): boolean;
  run(request: AgentRunRequest, signal: AbortSignal): Promise<AgentRunResult>;
}

export function idempotencyKey(request: Pick<AgentRunRequest, "agentId" | "taskType" | "trigger" | "taskId">): string {
  const origin = request.trigger.kind === "event" ? `event:${request.trigger.eventId}` : `task:${request.taskId ?? "none"}`;
  return `${request.agentId}:${request.taskType}:${origin}`;
}
