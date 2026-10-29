import type { AgentRunRecord } from "@/lib/agents/contract";
import type {
  AgentProposal,
  Client,
  ClientDetailsInput,
  ContextFieldInput,
  ContextFieldKey,
  Inquiry,
  InquiryDecision,
  NewClientInput,
  NewContextItemInput,
  NewProjectInput,
  NewSourceInput,
  NewTaskInput,
  Onboarding,
  OnboardingStepInput,
  Project,
  ProjectUpdateInput,
  ProposalDecision,
  SourceDocument,
  StudioSnapshot,
  Task,
  TaskDetailsInput,
  TaskStatus,
} from "@/lib/domain/types";

/**
 * Data access boundary. The UI and the agent runner both go through it, so
 * they share one version of client and project information. Implementations
 * validate input and enforce domain rules before saving.
 */
export interface StudioRepository {
  readonly info: RepositoryInfo;
  load(): Promise<StudioSnapshot>;
  createClient(input: NewClientInput): Promise<Client>;
  updateClient(clientId: string, input: ClientDetailsInput): Promise<Client>;
  setContextField(clientId: string, key: ContextFieldKey, input: ContextFieldInput): Promise<Client>;
  addContextItem(clientId: string, input: NewContextItemInput): Promise<Client>;
  addSource(clientId: string, input: NewSourceInput): Promise<SourceDocument>;
  /** Starts the client's guided onboarding, or returns the one already started. */
  startOnboarding(clientId: string): Promise<Onboarding>;
  /** Saves one onboarding step atomically: details, answers, skips, questions and progress. */
  saveOnboardingStep(onboardingId: string, input: OnboardingStepInput): Promise<Onboarding>;
  /** Marks the brief ready for review. Unknown values stay unknown. */
  completeOnboarding(onboardingId: string): Promise<Onboarding>;
  createProject(clientId: string, input: NewProjectInput): Promise<Project>;
  updateProject(projectId: string, input: ProjectUpdateInput): Promise<Project>;
  createTask(projectId: string, input: NewTaskInput): Promise<Task>;
  /** A reason is kept only when the task is blocked. */
  setTaskStatus(taskId: string, status: TaskStatus, options?: { blockedReason?: string }): Promise<Task>;
  /** Owner and due date. */
  updateTask(taskId: string, input: TaskDetailsInput): Promise<Task>;
  /** A person accepts or dismisses an agent's proposal. */
  reviewProposal(proposalId: string, decision: ProposalDecision): Promise<AgentProposal>;
  /** Asks the server to run the intake agent on this client's source material. */
  requestIntakeAnalysis(clientId: string, options?: { force?: boolean }): Promise<AgentRunRecord>;
  /** This month's AI spend across all agents, for owners. Only server workspaces have one. */
  aiSpend?(): Promise<AiSpend>;
  /**
   * A person decides a new website inquiry: approve it as a new client (with
   * a draft onboarding), add it to an existing client, reject it or mark it
   * as spam. Each inquiry is decided once.
   */
  decideInquiry(inquiryId: string, decision: InquiryDecision): Promise<Inquiry>;
  /**
   * An owner pauses the client's retention with a reason (an open dispute, a
   * legal requirement), or releases it with null. Every change is logged.
   */
  setRetentionHold(clientId: string, reason: string | null): Promise<Client>;
  /** Restores the demonstration workspace. Only meaningful for demo repositories. */
  resetDemoData(): Promise<StudioSnapshot>;
}

export type MemberRole = "owner" | "member" | "viewer";

export interface StudioMember {
  userId: string;
  displayName: string;
  role: MemberRole;
}

export type RepositoryInfo =
  | {
      kind: "local-demo";
      /** Where data actually lives, so the UI never over-promises persistence. */
      persistence: "browser" | "memory";
      canWrite: true;
    }
  | {
      kind: "supabase";
      persistence: "server";
      studio: { id: string; name: string };
      role: MemberRole;
      /** Owners and members can change data; viewers can only read. */
      canWrite: boolean;
      members: StudioMember[];
      user: { id: string; email: string | null };
    };

export type RepositoryErrorCode =
  | "not_found"
  | "validation"
  | "storage"
  /** The signed-in user may not do this. */
  | "permission"
  /** Someone else changed the record since it was loaded. */
  | "conflict"
  /** The sign-in session ended. */
  | "session"
  /** The server could not be reached. */
  | "network"
  /** The feature is not available in this setup. */
  | "unavailable";

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: RepositoryErrorCode,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

/** Amounts in micro-dollars (see src/lib/agents/pricing.ts). */
export interface AiSpend {
  /** First day of the month, YYYY-MM-DD (UTC). */
  month: string;
  spentMicros: number;
  /** Held for analyses still running. */
  reservedMicros: number;
  capMicros: number;
}
