import type {
  Client,
  ClientDetailsInput,
  ContextFieldInput,
  ContextFieldKey,
  NewClientInput,
  NewProjectInput,
  NewTaskInput,
  Project,
  ProjectUpdateInput,
  StudioSnapshot,
  Task,
  TaskStatus,
} from "@/lib/domain/types";

/**
 * Data access boundary. The UI and (later) agent runners both go through this
 * interface, so they share one version of client and project information.
 * Implementations validate input and enforce domain rules before saving.
 */
export interface StudioRepository {
  readonly info: RepositoryInfo;
  load(): Promise<StudioSnapshot>;
  createClient(input: NewClientInput): Promise<Client>;
  updateClient(clientId: string, input: ClientDetailsInput): Promise<Client>;
  setContextField(clientId: string, key: ContextFieldKey, input: ContextFieldInput): Promise<Client>;
  createProject(clientId: string, input: NewProjectInput): Promise<Project>;
  updateProject(projectId: string, input: ProjectUpdateInput): Promise<Project>;
  createTask(projectId: string, input: NewTaskInput): Promise<Task>;
  setTaskStatus(taskId: string, status: TaskStatus): Promise<Task>;
  /** Restores the demonstration workspace. Only meaningful for demo repositories. */
  resetDemoData(): Promise<StudioSnapshot>;
}

export interface RepositoryInfo {
  kind: "local-demo";
  /** Where data actually lives, so the UI never over-promises persistence. */
  persistence: "browser" | "memory";
}

export class RepositoryError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "validation" | "storage",
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}
