import type { AgentRunRecord } from "@/lib/agents/contract";
import type {
  AgentProposal,
  Client,
  ClientDetailsInput,
  ContextFieldInput,
  ContextFieldKey,
  NewClientInput,
  NewContextItemInput,
  NewProjectInput,
  NewSourceInput,
  NewTaskInput,
  Project,
  ProjectUpdateInput,
  ProposalDecision,
  SourceDocument,
  StudioSnapshot,
  Task,
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
  createProject(clientId: string, input: NewProjectInput): Promise<Project>;
  updateProject(projectId: string, input: ProjectUpdateInput): Promise<Project>;
  createTask(projectId: string, input: NewTaskInput): Promise<Task>;
  setTaskStatus(taskId: string, status: TaskStatus): Promise<Task>;
  /** A person accepts or dismisses an agent's proposal. */
  reviewProposal(proposalId: string, decision: ProposalDecision): Promise<AgentProposal>;
  /** Asks the server to run the intake agent on this client's source material. */
  requestIntakeAnalysis(clientId: string, options?: { force?: boolean }): Promise<AgentRunRecord>;
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
