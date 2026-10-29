import { clean, DomainError, type DomainDeps } from "./clients";
import { PLAYBOOK_MAX_TASKS } from "./playbooks";
import { PROJECT_STAGE_LABELS, PROJECT_STATUS_LABELS, PROJECT_TYPE_LABELS, TASK_STATUS_LABELS } from "./labels";
import type {
  ActivityEvent,
  Client,
  NewProjectInput,
  NewTaskInput,
  Project,
  ProjectUpdateInput,
  Task,
  TaskDetailsInput,
  TaskStatus,
} from "./types";

export const TITLE_MAX_LENGTH = 160;
export const OWNER_NAME_MAX_LENGTH = 120;
export const BLOCKED_REASON_MAX_LENGTH = 500;

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

/**
 * A new project starts planned, at intake. Only the name is needed. Tasks
 * given with it (usually from its playbook) are created with it, once each.
 */
export function buildProject(
  client: Client,
  input: NewProjectInput,
  deps: DomainDeps,
): { project: Project; event: ActivityEvent; tasks: Task[] } {
  const name = requireTitle(input.name, "project name");
  const titles = [...new Set((input.tasks ?? []).map((title) => requireTitle(title, "task")))];
  if (titles.length > PLAYBOOK_MAX_TASKS) throw new DomainError(`Start with at most ${PLAYBOOK_MAX_TASKS} tasks.`);
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
  const tasks: Task[] = titles.map((title) => ({
    id: deps.createId(),
    projectId: project.id,
    title,
    status: "todo",
    assignee: null,
    isDemo: false,
    createdAt: now,
    updatedAt: now,
  }));
  const description = tasks.length
    ? `Started project ${name} with ${tasks.length === 1 ? "1 task" : `${tasks.length} tasks`}`
    : `Started project ${name}`;
  return { project, tasks, event: event("project", project.id, "project.created", description, deps, now) };
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
export function setTaskStatus(
  task: Task,
  status: TaskStatus,
  deps: DomainDeps,
  options: { blockedReason?: string } = {},
): { task: Task; events: ActivityEvent[] } {
  const reason = status === "blocked" ? clean(options.blockedReason) : null;
  if (reason && reason.length > BLOCKED_REASON_MAX_LENGTH) throw new DomainError(`Keep the reason under ${BLOCKED_REASON_MAX_LENGTH} characters.`);
  if (status === task.status) {
    // Still blocked, for a new reason.
    if (status === "blocked" && reason && reason !== task.blockedReason) {
      const now = deps.now();
      return {
        task: { ...task, blockedReason: reason, updatedAt: now },
        events: [event("task", task.id, "task.updated", `${task.title} blocked: ${reason}`, deps, now)],
      };
    }
    return { task, events: [] };
  }

  const approving = task.status === "awaiting_approval" && status === "done";
  if (approving && deps.actor.kind !== "human") {
    throw new DomainError("Only a person can approve work.");
  }

  const now = deps.now();
  const [eventType, description]: [ActivityEvent["eventType"], string] = approving
    ? ["decision.approved", `Approved ${task.title}`]
    : status === "done"
      ? ["task.completed", `Completed ${task.title}`]
      : status === "blocked" && reason
        ? ["task.status_changed", `${task.title} blocked: ${reason}`]
        : ["task.status_changed", `${task.title} moved to ${TASK_STATUS_LABELS[status].toLowerCase()}`];

  const next: Task = { ...task, status, updatedAt: now };
  if (reason) next.blockedReason = reason;
  else delete next.blockedReason;
  return { task: next, events: [event("task", task.id, eventType, description, deps, now)] };
}

const DUE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDueDate(value: string): boolean {
  if (!DUE_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Sets who owns a task and when it is due. Only a person assigns work, and
 * only to a person: agents are not connected, so none can own a task.
 */
export function updateTaskDetails(task: Task, input: TaskDetailsInput, deps: DomainDeps): { task: Task; events: ActivityEvent[] } {
  if (deps.actor.kind !== "human") throw new DomainError("Only a person can assign work.");
  const ownerName = clean(input.ownerName);
  if (ownerName && ownerName.length > OWNER_NAME_MAX_LENGTH) throw new DomainError(`Keep the name under ${OWNER_NAME_MAX_LENGTH} characters.`);
  const dueDate = clean(input.dueDate);
  if (dueDate && !validDueDate(dueDate)) throw new DomainError("Enter the due date as a date.");

  const assignee: Task["assignee"] = ownerName
    ? { kind: "human", name: ownerName, ...(input.ownerUserId ? { userId: input.ownerUserId } : {}) }
    : null;
  const sameOwner =
    (assignee === null && task.assignee === null) ||
    (assignee !== null && task.assignee?.kind === "human" && task.assignee.name === assignee.name && task.assignee.userId === assignee.userId);
  const sameDue = (task.dueDate?.slice(0, 10) ?? null) === dueDate;
  if (sameOwner && sameDue) return { task, events: [] };

  const now = deps.now();
  const events: ActivityEvent[] = [];
  if (!sameOwner) {
    events.push(event("task", task.id, "task.updated", assignee ? `${task.title} assigned to ${ownerName}` : `${task.title} unassigned`, deps, now));
  }
  if (!sameDue) {
    events.push(event("task", task.id, "task.updated", dueDate ? `${task.title} due ${dueDate}` : `${task.title} has no due date`, deps, now));
  }
  const next: Task = { ...task, assignee, updatedAt: now };
  if (dueDate) next.dueDate = dueDate;
  else delete next.dueDate;
  return { task: next, events };
}
