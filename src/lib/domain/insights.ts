/**
 * Read-only views derived from the studio snapshot. Every list on Today and
 * in the client workspace comes from here, so the screens never disagree.
 */
import { formatContextValue } from "@/lib/format";
import { getMissingEssentials } from "./clients";
import { describeInquiry, getOpenInquiries, getRepeats } from "./inquiries";
import { actorLabel, CLIENT_STATUS_LABELS, CONFIDENCE_LABELS, CONTEXT_FIELD_LABELS, ONBOARDING_STEP_LABELS, PROJECT_STAGE_LABELS } from "./labels";
import { describeDaysLeft, getRetentionWarnings } from "./retention";
import {
  CONTEXT_FIELD_KEYS,
  type ActivityEvent,
  type Client,
  type ISODateString,
  type Project,
  type StudioSnapshot,
  type Task,
} from "./types";

export function byTimestampDesc(a: { timestamp: string }, b: { timestamp: string }): number {
  return b.timestamp.localeCompare(a.timestamp);
}

export function getClientProjects(clientId: string, projects: Project[]): Project[] {
  const order = { active: 0, planned: 1, on_hold: 2, completed: 3 };
  return projects
    .filter((project) => project.clientId === clientId)
    .sort((a, b) => order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt));
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

export function getProjectTasks(projectId: string, tasks: Task[]): Task[] {
  return tasks
    .filter((task) => task.projectId === projectId)
    .sort((a, b) => taskUrgency(a) - taskUrgency(b) || a.createdAt.localeCompare(b.createdAt));
}

/** All events about the client, its projects and their tasks, newest first. */
export function getClientActivity(clientId: string, snapshot: StudioSnapshot): ActivityEvent[] {
  const projectIds = new Set(snapshot.projects.filter((p) => p.clientId === clientId).map((p) => p.id));
  const taskIds = new Set(snapshot.tasks.filter((task) => projectIds.has(task.projectId)).map((task) => task.id));

  return snapshot.activity
    .filter(
      (event) =>
        (event.entityType === "client" && event.entityId === clientId) ||
        (event.entityType === "project" && projectIds.has(event.entityId)) ||
        (event.entityType === "task" && taskIds.has(event.entityId)),
    )
    .sort(byTimestampDesc);
}

export interface ActivityEntry {
  event: ActivityEvent;
  clientId: string | null;
  clientName: string | null;
}

/** Resolves each event to its client so timelines can link to the right workspace. */
export function getRecentActivity(snapshot: StudioSnapshot, limit = 6): ActivityEntry[] {
  const projectClient = new Map(snapshot.projects.map((project) => [project.id, project.clientId]));
  const taskClient = new Map(snapshot.tasks.map((task) => [task.id, projectClient.get(task.projectId) ?? null]));
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

function clientHref(clientId: string, anchor?: string) {
  return `/clients/${encodeURIComponent(clientId)}${anchor ? `#${anchor}` : ""}`;
}

/* -------------------------------------------------------------------------- */
/* Client list                                                                */
/* -------------------------------------------------------------------------- */

export interface ClientRow {
  client: Client;
  projects: Project[];
  /** One short line that tells the client's current situation. */
  situation: string;
  lastActivity: ISODateString;
}

export function getClientRows(snapshot: StudioSnapshot): ClientRow[] {
  return snapshot.clients
    .map((client) => {
      const projects = getClientProjects(client.id, snapshot.projects);
      const latestEvent = getClientActivity(client.id, snapshot)[0];
      const lastActivity =
        latestEvent && latestEvent.timestamp > client.updatedAt ? latestEvent.timestamp : client.updatedAt;
      return { client, projects, situation: describeSituation(client, projects), lastActivity };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
}

function describeSituation(client: Client, projects: Project[]): string {
  if (client.status === "archived") return projects.length ? `Archived · ${projects.length === 1 ? "1 project" : `${projects.length} projects`}` : "Archived";
  if (client.status === "on_hold") return "On hold";
  const current = projects.find((p) => p.status === "active") ?? projects.find((p) => p.status === "planned");
  if (current) return `${current.name} · ${PROJECT_STAGE_LABELS[current.stage]}`;
  const missing = getMissingEssentials(client).length;
  const status = CLIENT_STATUS_LABELS[client.status];
  return missing ? `${status} · ${missing} ${missing === 1 ? "detail" : "details"} to collect` : `${status} · Ready for a project`;
}

export function matchesClientQuery(row: ClientRow, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [row.client.name, row.client.contactPerson, row.client.email, row.client.website, ...row.projects.map((p) => p.name)]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase()
    .includes(needle);
}

/* -------------------------------------------------------------------------- */
/* Decisions: what only a person can resolve                                  */
/* -------------------------------------------------------------------------- */

export type DecisionKind = "inquiry" | "retention" | "approval" | "review" | "analysis" | "proposal";

export interface DecisionItem {
  id: string;
  kind: DecisionKind;
  title: string;
  /** Client and project, for orientation. */
  where: string;
  /** Null for a website inquiry that has no client yet. */
  clientId: string | null;
  href: string;
}

const DECISION_ORDER: Record<DecisionKind, number> = { inquiry: 0, retention: 1, approval: 2, review: 3, analysis: 4, proposal: 5 };

/**
 * New website inquiries, clients about to be anonymised, approvals, reviews
 * and proposed client facts. These wait for a person; no automation or agent
 * may resolve them.
 */
export function getDecisions(snapshot: StudioSnapshot, nowMs = Date.now()): DecisionItem[] {
  const items: DecisionItem[] = [];

  for (const inquiry of getOpenInquiries(snapshot)) {
    const repeats = getRepeats(inquiry, snapshot.inquiries).length;
    items.push({
      id: `inquiry-${inquiry.id}`,
      kind: "inquiry",
      title: `New inquiry from ${inquiry.company ?? inquiry.contactName}`,
      where: [inquiry.isTest ? "Test inquiry" : "Website inquiry", describeInquiry(inquiry), repeats ? `Sent ${repeats + 1} times` : null]
        .filter(Boolean)
        .join(" · "),
      clientId: null,
      href: `/inquiries/${encodeURIComponent(inquiry.id)}`,
    });
  }
  // Clients the retention job will anonymise soon: archive, hold or let it run.
  for (const { client, days } of getRetentionWarnings(snapshot.clients, nowMs)) {
    items.push({
      id: `retention-${client.id}`,
      kind: "retention",
      title: `${client.name}: client data will be anonymised`,
      where: describeDaysLeft(days),
      clientId: client.id,
      href: clientHref(client.id, "retention"),
    });
  }

  const projectById = new Map(snapshot.projects.map((project) => [project.id, project]));
  const clientById = new Map(snapshot.clients.map((client) => [client.id, client]));

  for (const task of snapshot.tasks) {
    if (task.status !== "awaiting_approval" && task.status !== "in_review") continue;
    const project = projectById.get(task.projectId);
    const client = project ? clientById.get(project.clientId) : undefined;
    if (!project || !client) continue;
    items.push({
      id: `task-${task.id}`,
      kind: task.status === "awaiting_approval" ? "approval" : "review",
      title: task.title,
      where: `${client.name} · ${project.name}`,
      clientId: client.id,
      href: clientHref(client.id, `task-${task.id}`),
    });
  }

  for (const client of snapshot.clients) {
    if (client.status === "archived") continue;
    for (const key of CONTEXT_FIELD_KEYS) {
      const field = client.context[key];
      if (field.value === null || field.confidence !== "proposed") continue;
      items.push({
        id: `proposal-${client.id}-${key}`,
        kind: "proposal",
        title: `${CONTEXT_FIELD_LABELS[key]}: ${formatContextValue(field.value)}`,
        where: `${client.name} · ${field.recordedBy ? `Proposed by ${actorLabel(field.recordedBy)}` : CONFIDENCE_LABELS.proposed}`,
        clientId: client.id,
        href: clientHref(client.id, `brief-${key}`),
      });
    }
  }

  // Agent proposals waiting for review, one entry per client.
  const pending = new Map<string, number>();
  for (const proposal of snapshot.proposals) {
    if (proposal.status === "pending") pending.set(proposal.clientId, (pending.get(proposal.clientId) ?? 0) + 1);
  }
  for (const [clientId, count] of pending) {
    const client = clientById.get(clientId);
    if (!client || client.status === "archived") continue;
    items.push({
      id: `analysis-${clientId}`,
      kind: "analysis",
      title: `Review intake analysis: ${count === 1 ? "1 proposed value" : `${count} proposed values`}`,
      where: `${client.name} · Proposed by ${actorLabel({ kind: "agent", agentId: "research" })}`,
      clientId,
      href: clientHref(clientId, "analysis"),
    });
  }

  return items.sort((a, b) => DECISION_ORDER[a.kind] - DECISION_ORDER[b.kind]);
}

/** The newest intake run for a client, if any. */
export function getLatestIntakeRun(snapshot: StudioSnapshot, clientId: string) {
  return snapshot.agentRuns
    .filter((run) => run.clientId === clientId && run.taskType === "research.intake")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

/* -------------------------------------------------------------------------- */
/* Next actions: what should happen next                                      */
/* -------------------------------------------------------------------------- */

export type NextActionKind = "blocked" | "task" | "collect" | "start_project";

export interface NextAction {
  id: string;
  kind: NextActionKind;
  title: string;
  detail: string;
  clientId: string;
  href: string;
}

const ACTION_ORDER: Record<NextActionKind, number> = { blocked: 0, task: 1, collect: 2, start_project: 3 };

/**
 * The next useful step for each client that is in play: unblock stuck work,
 * continue the most important open task, or complete a new client's brief.
 */
export function getNextActions(snapshot: StudioSnapshot, clientId?: string): NextAction[] {
  const actions: NextAction[] = [];

  for (const client of snapshot.clients) {
    if (clientId ? client.id !== clientId : client.status === "archived" || client.status === "on_hold") continue;
    const projects = getClientProjects(client.id, snapshot.projects);
    const running = projects.filter((p) => p.status === "active" || p.status === "planned");

    for (const project of running) {
      const tasks = getProjectTasks(project.id, snapshot.tasks);
      for (const task of tasks.filter((t) => t.status === "blocked")) {
        actions.push({
          id: `blocked-${task.id}`,
          kind: "blocked",
          title: task.title,
          detail: task.blockedReason ?? `${client.name} · ${project.name}`,
          clientId: client.id,
          href: clientHref(client.id, `task-${task.id}`),
        });
      }
      const next = tasks.find((t) => t.status === "in_progress" || t.status === "todo");
      if (next) {
        actions.push({
          id: `task-${next.id}`,
          kind: "task",
          title: next.title,
          detail: [client.name, project.name, next.assignee ? actorLabel(next.assignee) : "Unassigned"].join(" · "),
          clientId: client.id,
          href: clientHref(client.id, `task-${next.id}`),
        });
      }
    }

    if (running.length === 0 && client.status !== "on_hold" && client.status !== "archived") {
      const missing = getMissingEssentials(client);
      const onboarding = snapshot.onboardings.find((o) => o.clientId === client.id && o.projectId === null);
      actions.push(
        onboarding && onboarding.status !== "ready_for_review"
          ? {
              id: `collect-${client.id}`,
              kind: "collect",
              title: `Continue onboarding for ${client.name}`,
              detail: `Saved at ${ONBOARDING_STEP_LABELS[onboarding.currentStep].toLowerCase()}`,
              clientId: client.id,
              href: `/clients/${encodeURIComponent(client.id)}/onboarding`,
            }
          : missing.length > 0 && onboarding?.status !== "ready_for_review"
          ? {
              id: `collect-${client.id}`,
              kind: "collect",
              title: `Complete the brief for ${client.name}`,
              detail: `Still missing: ${missing.map((m) => m.label.toLowerCase()).join(", ")}`,
              clientId: client.id,
              href: clientHref(client.id, "brief"),
            }
          : {
              id: `start-${client.id}`,
              kind: "start_project",
              title: `Start the first project for ${client.name}`,
              // After onboarding the brief is ready even with gaps; they stay listed in the brief.
              detail: missing.length > 0 ? `Brief ready, still unknown: ${missing.map((m) => m.label.toLowerCase()).join(", ")}` : "The essentials are recorded.",
              clientId: client.id,
              href: clientHref(client.id, "projects"),
            },
      );
    }
  }

  return actions.sort((a, b) => ACTION_ORDER[a.kind] - ACTION_ORDER[b.kind]);
}

/* -------------------------------------------------------------------------- */
/* Work in progress                                                           */
/* -------------------------------------------------------------------------- */

export interface ActiveWork {
  project: Project;
  client: Client;
  openTasks: number;
}

export function getActiveWork(snapshot: StudioSnapshot): ActiveWork[] {
  const clientById = new Map(snapshot.clients.map((client) => [client.id, client]));
  return snapshot.projects
    .filter((project) => project.status === "active")
    .flatMap((project) => {
      const client = clientById.get(project.clientId);
      if (!client) return [];
      const openTasks = snapshot.tasks.filter((t) => t.projectId === project.id && t.status !== "done").length;
      return [{ project, client, openTasks }];
    })
    .sort((a, b) => b.project.updatedAt.localeCompare(a.project.updatedAt));
}
