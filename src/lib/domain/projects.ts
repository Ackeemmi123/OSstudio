import { clean, DomainError, type DomainDeps } from "./clients";
import { PROJECT_STAGE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, TASK_STATUS_LABELS } from "./labels";
import type {
  ActivityEvent,
  Client,
  NewProjectInput,
  NewTaskInput,
  Project,
  ProjectUpdateInput,
  Task,
  TaskStatus,
} from "./types";

export const TITLE_MAX_LENGTH = 160;

function event(
  entityType: ActivityEvent["entityType"],
  entityId: string,
  eventType: ActivityEvent["eventType"],
  description: string,
  deps: DomainDeps,
  now: string,
): ActivityEvent {
  return { id: deps.createId(), entityType, entityId, eventType, description, actor: deps.actor, timestamp: now };
}

function requireTitle(value: string, what: string): string {
  const title = clean(value);
  if (!title) throw new DomainError(`Enter a ${what}.`);
  if (title.length > TITLE_MAX_LENGTH) throw new DomainError(`Keep the ${what} under ${TITLE_MAX_LENGTH} characters.`);
  return title;
}

/** Suggested name for a client's next project, based on what they asked for. */
export function suggestProjectName(client: Client): string {
  return client.projectType ? PROJECT_TYPE_LABELS[client.projectType] : "";
}

/** A new project starts planned, at intake. Only the name is needed. */
export function buildProject(
  client: Client,
  input: NewProjectInput,
  deps: DomainDeps,
): { project: Project; event: ActivityEvent } {
  const name = requireTitle(input.name, "project name");
  const now = deps.now();
  const project: Project = {
    id: deps.createId(),
    clientId: client.id,
    name,
    projectType: input.projectType ?? client.projectType ?? "other",
    status: "planned",
    stage: "intake",
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };
  return { project, event: event("project", project.id, "project.created", `Started project ${name}`, deps, now) };
}

export function updateProject(
  project: Project,
  input: ProjectUpdateInput,
  deps: DomainDeps,
): { project: Project; events: ActivityEvent[] } {
  const status = input.status ?? project.status;
  const stage = input.stage ?? project.stage;
  if (status === project.status && stage === project.stage) return { project, events: [] };

  const now = deps.now();
  const events: ActivityEvent[] = [];
  if (stage !== project.stage) {
    events.push(event("project", project.id, "project.stage_changed", `${project.name} moved to ${PROJECT_STAGE_LABELS[stage]}`, deps, now));
  }
  if (status !== project.status) {
    events.push(event("project", project.id, "project.updated", `${project.name} marked ${PROJECT_STATUS_LABELS[status].toLowerCase()}`, deps, now));
  }
  return { project: { ...project, status, stage, updatedAt: now }, events };
}

export function buildTask(project: Project, input: NewTaskInput, deps: DomainDeps): { task: Task; event: ActivityEvent } {
  const title = requireTitle(input.title, "task");
  const now = deps.now();
  const task: Task = {
    id: deps.createId(),
    projectId: project.id,
    title,
    status: "todo",
    assignee: null,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  };
  return { task, event: event("task", task.id, "task.created", `Added task ${title}`, deps, now) };
}

/**
 * Changes a task's status. Completing a task that was awaiting approval is
 * recorded as an approval decision, which only a person can make.
 */
export function setTaskStatus(task: Task, status: TaskStatus, deps: DomainDeps): { task: Task; events: ActivityEvent[] } {
  if (status === task.status) return { task, events: [] };

  const approving = task.status === "awaiting_approval" && status === "done";
  if (approving && deps.actor.kind !== "human") {
    throw new DomainError("Only a person can approve work.");
  }

  const now = deps.now();
  const [eventType, description]: [ActivityEvent["eventType"], string] = approving
    ? ["decision.approved", `Approved ${task.title}`]
    : status === "done"
      ? ["task.completed", `Completed ${task.title}`]
      : ["task.status_changed", `${task.title} moved to ${TASK_STATUS_LABELS[status].toLowerCase()}`];

  const next: Task = { ...task, status, updatedAt: now };
  if (status !== "blocked") delete next.blockedReason;
  return { task: next, events: [event("task", task.id, eventType, description, deps, now)] };
}
