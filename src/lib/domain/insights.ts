/**
 * Read-only views derived from the studio snapshot. Every number on the
 * dashboard and client pages comes from here, so totals stay consistent.
 */
import { getMissingInformation, getUnconfirmedFields } from "./clients";
import { TASK_STATUS_LABELS } from "./labels";
import type {
  ActivityEvent,
  Client,
  ISODateString,
  Project,
  ProjectType,
  StudioSnapshot,
  Task,
} from "./types";

export interface ProjectProgress {
  done: number;
  total: number;
}

export function getProjectProgress(project: Project, tasks: Task[]): ProjectProgress {
  const projectTasks = tasks.filter((task) => task.projectId === project.id);
  return {
    done: projectTasks.filter((task) => task.status === "done").length,
    total: projectTasks.length,
  };
}

export function getClientProjects(clientId: string, projects: Project[]): Project[] {
  return projects.filter((project) => project.clientId === clientId);
}

export function getClientTasks(clientId: string, snapshot: StudioSnapshot): Task[] {
  const projectIds = new Set(getClientProjects(clientId, snapshot.projects).map((p) => p.id));
  return snapshot.tasks.filter((task) => projectIds.has(task.projectId));
}

/** All events about the client, its projects and their tasks, newest first. */
export function getClientActivity(clientId: string, snapshot: StudioSnapshot): ActivityEvent[] {
  const projectIds = new Set(getClientProjects(clientId, snapshot.projects).map((p) => p.id));
  const taskIds = new Set(
    snapshot.tasks.filter((task) => projectIds.has(task.projectId)).map((task) => task.id),
  );

  return snapshot.activity
    .filter(
      (event) =>
        (event.entityType === "client" && event.entityId === clientId) ||
        (event.entityType === "project" && projectIds.has(event.entityId)) ||
        (event.entityType === "task" && taskIds.has(event.entityId)),
    )
    .sort(byTimestampDesc);
}

export function byTimestampDesc(a: { timestamp: string }, b: { timestamp: string }): number {
  return b.timestamp.localeCompare(a.timestamp);
}

/* -------------------------------------------------------------------------- */
/* Client list                                                                */
/* -------------------------------------------------------------------------- */

export interface ClientRow {
  client: Client;
  projects: Project[];
  /** The client's stated project type, or the type of its first project. */
  projectType: ProjectType | null;
  lastActivity: ISODateString;
  missingEssentials: number;
}

export function getClientRows(snapshot: StudioSnapshot): ClientRow[] {
  return snapshot.clients
    .map((client) => {
      const projects = getClientProjects(client.id, snapshot.projects);
      const latestEvent = getClientActivity(client.id, snapshot)[0];
      const lastActivity =
        latestEvent && latestEvent.timestamp > client.updatedAt
          ? latestEvent.timestamp
          : client.updatedAt;

      return {
        client,
        projects,
        projectType: client.projectType ?? projects[0]?.projectType ?? null,
        lastActivity,
        missingEssentials: getMissingInformation(client).filter((item) => item.essential).length,
      };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

export function matchesClientQuery(row: ClientRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  const haystack = [
    row.client.name,
    row.client.contactPerson,
    row.client.email,
    row.client.website,
    ...row.projects.map((project) => project.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(needle);
}

/* -------------------------------------------------------------------------- */
/* Attention and next steps                                                   */
/* -------------------------------------------------------------------------- */

export type AttentionKind = "missing_info" | "blocked" | "review" | "approval";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  clientId: string;
  href: string;
}

const ATTENTION_ORDER: Record<AttentionKind, number> = {
  blocked: 0,
  approval: 1,
  review: 2,
  missing_info: 3,
};

export function getAttentionItems(snapshot: StudioSnapshot): AttentionItem[] {
  const items: AttentionItem[] = [];
  const projectById = new Map(snapshot.projects.map((project) => [project.id, project]));
  const clientById = new Map(snapshot.clients.map((client) => [client.id, client]));

  for (const task of snapshot.tasks) {
    const project = projectById.get(task.projectId);
    const client = project ? clientById.get(project.clientId) : undefined;
    if (!project || !client) continue;

    const where = `${client.name} · ${project.name}`;
    const href = `/clients/${client.id}?tab=workflow`;
    if (task.status === "blocked") {
      items.push({
        id: `blocked-${task.id}`,
        kind: "blocked",
        title: task.title,
        detail: task.blockedReason ? `${where} — ${task.blockedReason}` : where,
        clientId: client.id,
        href,
      });
    } else if (task.status === "in_review") {
      items.push({ id: `review-${task.id}`, kind: "review", title: task.title, detail: where, clientId: client.id, href });
    } else if (task.status === "awaiting_approval") {
      items.push({ id: `approval-${task.id}`, kind: "approval", title: task.title, detail: where, clientId: client.id, href });
    }
  }

  for (const client of snapshot.clients) {
    if (client.status === "archived") continue;
    const essentials = getMissingInformation(client).filter((item) => item.essential);
    if (essentials.length === 0) continue;
    items.push({
      id: `missing-${client.id}`,
      kind: "missing_info",
      title: `${client.name} is missing ${essentials.length === 1 ? "1 detail" : `${essentials.length} details`}`,
      detail: essentials.map((item) => item.label).join(", "),
      clientId: client.id,
      href: `/clients/${client.id}`,
    });
  }

  return items.sort((a, b) => ATTENTION_ORDER[a.kind] - ATTENTION_ORDER[b.kind]);
}

export interface NextStep {
  id: string;
  text: string;
  detail?: string;
}

/** Suggested next steps for a client, derived only from recorded data. */
export function getClientNextSteps(client: Client, snapshot: StudioSnapshot): NextStep[] {
  const steps: NextStep[] = [];
  const missing = getMissingInformation(client);
  const essentials = missing.filter((item) => item.essential);

  if (essentials.length > 0) {
    steps.push({
      id: "missing",
      text: `Collect ${essentials.map((item) => item.label.toLowerCase()).join(", ")}`,
      detail: "Essential before the project can be scoped.",
    });
  }

  const unconfirmed = getUnconfirmedFields(client);
  if (unconfirmed.length > 0) {
    steps.push({
      id: "confirm",
      text: `Confirm ${unconfirmed.length === 1 ? "1 detail" : `${unconfirmed.length} details`} with the client`,
      detail: unconfirmed.map((field) => field.label).join(", "),
    });
  }

  const openQuestions = client.contextItems.filter(
    (item) => item.kind === "question" && item.confidence !== "superseded",
  );
  if (openQuestions.length > 0) {
    steps.push({
      id: "questions",
      text: `Resolve ${openQuestions.length === 1 ? "1 open question" : `${openQuestions.length} open questions`}`,
    });
  }

  const tasks = getClientTasks(client.id, snapshot)
    .filter((task) => task.status !== "done")
    .sort((a, b) => taskUrgency(a) - taskUrgency(b));
  for (const task of tasks.slice(0, 3)) {
    steps.push({
      id: `task-${task.id}`,
      text: task.title,
      detail: `${TASK_STATUS_LABELS[task.status]}${task.assignedTo ? ` · ${task.assignedTo}` : " · Unassigned"}`,
    });
  }

  if (getClientProjects(client.id, snapshot.projects).length === 0) {
    steps.push({
      id: "project",
      text: "Set up the first project once the brief is clear",
    });
  }

  return steps;
}

/** Blocked work first, then work waiting on someone, then active work. */
export function taskUrgency(task: Task): number {
  const order: Record<Task["status"], number> = {
    blocked: 0,
    awaiting_approval: 1,
    in_review: 2,
    in_progress: 3,
    todo: 4,
    done: 5,
  };
  return order[task.status];
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export interface DashboardSummary {
  activeProjects: Project[];
  openTasks: number;
  attention: AttentionItem[];
  pendingApprovals: number;
  activeClients: number;
}

export function getDashboardSummary(snapshot: StudioSnapshot): DashboardSummary {
  const activeProjects = snapshot.projects.filter((project) => project.status === "active");
  const attention = getAttentionItems(snapshot);
  return {
    activeProjects,
    openTasks: snapshot.tasks.filter((task) => task.status !== "done").length,
    attention,
    pendingApprovals: attention.filter((item) => item.kind === "approval").length,
    activeClients: snapshot.clients.filter((client) => client.status === "active").length,
  };
}

export interface ActivityEntry {
  event: ActivityEvent;
  clientId: string | null;
  clientName: string | null;
}

/** Resolves each event to its client so timelines can link to the right profile. */
export function getRecentActivity(snapshot: StudioSnapshot, limit = 8): ActivityEntry[] {
  const projectClient = new Map(snapshot.projects.map((project) => [project.id, project.clientId]));
  const taskClient = new Map(
    snapshot.tasks.map((task) => [task.id, projectClient.get(task.projectId) ?? null]),
  );
  const clientNames = new Map(snapshot.clients.map((client) => [client.id, client.name]));

  return [...snapshot.activity]
    .sort(byTimestampDesc)
    .slice(0, limit)
    .map((event) => {
      const clientId =
        event.entityType === "client"
          ? event.entityId
          : event.entityType === "project"
            ? (projectClient.get(event.entityId) ?? null)
            : (taskClient.get(event.entityId) ?? null);
      return { event, clientId, clientName: clientId ? (clientNames.get(clientId) ?? null) : null };
    });
}
