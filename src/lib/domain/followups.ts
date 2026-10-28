/**
 * Follow-ups: work that has waited longer than it should. Computed from the
 * snapshot every time Today or a client workspace renders, so nothing is
 * stored, nothing is changed and nothing is sent. Each rule and its threshold
 * lives in FOLLOW_UP_RULES; change a number there and every screen follows.
 *
 * A follow-up points at the same item that Today otherwise lists under "Needs
 * your decision" or "Next up" (see `relatedIds`), so a screen can show it once.
 */
import { getMissingEssentials } from "./clients";
import { describeInquiry, getOpenInquiries } from "./inquiries";
import { getClientProjects } from "./insights";
import { PROJECT_STAGE_LABELS } from "./labels";
import type { ISODateString, StudioSnapshot } from "./types";

export type FollowUpKind = "inquiry" | "approval" | "review" | "blocked" | "overdue" | "onboarding" | "start_project" | "quiet_project";

export interface FollowUpRule {
  /** How long the item may wait before it is a follow-up. */
  after: number;
  unit: "working_days" | "days";
  /** What a person does about it, shown as the row's tag. */
  action: string;
}

/**
 * Working days are Monday to Friday in Helsinki. Public holidays are not
 * counted separately, so a follow-up can appear a day early after one.
 */
export const FOLLOW_UP_RULES: Record<FollowUpKind, FollowUpRule> = {
  inquiry: { after: 2, unit: "working_days", action: "Decide" },
  approval: { after: 2, unit: "working_days", action: "Approve" },
  review: { after: 2, unit: "working_days", action: "Review" },
  blocked: { after: 3, unit: "days", action: "Unblock" },
  overdue: { after: 1, unit: "days", action: "Reschedule" },
  onboarding: { after: 5, unit: "days", action: "Continue" },
  start_project: { after: 3, unit: "days", action: "Start project" },
  quiet_project: { after: 10, unit: "days", action: "Check in" },
};

export interface FollowUp {
  id: string;
  kind: FollowUpKind;
  title: string;
  detail: string;
  /** Null for a website inquiry that has no client yet. */
  clientId: string | null;
  href: string;
  /** When the wait started. */
  since: ISODateString;
  /** How long it has waited, in the rule's unit. */
  waited: number;
  /** Ids of the decision or next action this follow-up stands for. */
  relatedIds: string[];
}

const DAY = 24 * 60 * 60 * 1000;
const TIME_ZONE = "Europe/Helsinki";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** Today's date in Helsinki, as YYYY-MM-DD. */
export function helsinkiDate(ms: number): string {
  return dayFormat.format(ms);
}

/** The calendar day in Helsinki, as a UTC midnight timestamp, so days can be stepped through safely. */
function helsinkiDay(ms: number): number {
  return Date.parse(`${dayFormat.format(ms)}T00:00:00Z`);
}

/** Working days (Monday to Friday, Helsinki) after the start day, up to and including today. */
export function workingDaysBetween(startMs: number, nowMs: number): number {
  const end = helsinkiDay(nowMs);
  let count = 0;
  for (let day = helsinkiDay(startMs) + DAY; day <= end; day += DAY) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

/** Whole days since the start. */
export function daysBetween(startMs: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - startMs) / DAY));
}

function waitedFor(kind: FollowUpKind, since: ISODateString, nowMs: number): number | null {
  const startMs = Date.parse(since);
  if (Number.isNaN(startMs)) return null;
  const rule = FOLLOW_UP_RULES[kind];
  const waited = rule.unit === "working_days" ? workingDaysBetween(startMs, nowMs) : daysBetween(startMs, nowMs);
  return waited >= rule.after ? waited : null;
}

/** "Waiting 3 working days", "No activity for 12 days". */
export function describeWait(followUp: Pick<FollowUp, "kind" | "waited">): string {
  const { unit } = FOLLOW_UP_RULES[followUp.kind];
  const amount = `${followUp.waited} ${unit === "working_days" ? "working " : ""}${followUp.waited === 1 ? "day" : "days"}`;
  if (followUp.kind === "quiet_project") return `No activity for ${amount}`;
  if (followUp.kind === "blocked") return `Blocked for ${amount}`;
  if (followUp.kind === "overdue") return `Overdue by ${amount}`;
  if (followUp.kind === "onboarding") return `Untouched for ${amount}`;
  if (followUp.kind === "start_project") return `Brief ready for ${amount}`;
  return `Waiting ${amount}`;
}

function clientHref(clientId: string, anchor?: string) {
  return `/clients/${encodeURIComponent(clientId)}${anchor ? `#${anchor}` : ""}`;
}

function latest(...timestamps: (ISODateString | undefined)[]): ISODateString {
  return timestamps.filter((t): t is ISODateString => Boolean(t)).reduce((a, b) => (b > a ? b : a));
}

/**
 * Everything that has waited past its rule, longest wait first. Archived and
 * paused clients are left out, as on the rest of Today. With `clientId`, only
 * that client's follow-ups (inquiries without a client are then left out).
 */
export function getFollowUps(snapshot: StudioSnapshot, nowMs: number, clientId?: string): FollowUp[] {
  const items: FollowUp[] = [];
  const push = (item: Omit<FollowUp, "waited">) => {
    const waited = waitedFor(item.kind, item.since, nowMs);
    if (waited !== null) items.push({ ...item, waited });
  };
  const today = helsinkiDay(nowMs);

  if (!clientId) {
    for (const inquiry of getOpenInquiries(snapshot)) {
      push({
        id: `follow-inquiry-${inquiry.id}`,
        kind: "inquiry",
        title: `Inquiry from ${inquiry.company ?? inquiry.contactName}`,
        detail: `${inquiry.isTest ? "Test inquiry" : "Website inquiry"} · ${describeInquiry(inquiry)}`,
        clientId: null,
        href: `/inquiries/${encodeURIComponent(inquiry.id)}`,
        since: inquiry.receivedAt,
        relatedIds: [`inquiry-${inquiry.id}`],
      });
    }
  }

  for (const client of snapshot.clients) {
    if (clientId && client.id !== clientId) continue;
    if (client.status === "archived" || client.status === "on_hold") continue;

    const projects = getClientProjects(client.id, snapshot.projects);
    const running = projects.filter((p) => p.status === "active" || p.status === "planned");

    for (const project of running) {
      const tasks = snapshot.tasks.filter((t) => t.projectId === project.id);
      const before = items.length;
      for (const task of tasks) {
        const where = `${client.name} · ${project.name}`;
        if (task.status === "awaiting_approval" || task.status === "in_review") {
          const kind = task.status === "awaiting_approval" ? "approval" : "review";
          push({ id: `follow-task-${task.id}`, kind, title: task.title, detail: where, clientId: client.id, href: clientHref(client.id, `task-${task.id}`), since: task.updatedAt, relatedIds: [`task-${task.id}`] });
        } else if (task.status === "blocked") {
          push({
            id: `follow-task-${task.id}`,
            kind: "blocked",
            title: task.title,
            detail: task.blockedReason ?? where,
            clientId: client.id,
            href: clientHref(client.id, `task-${task.id}`),
            since: task.updatedAt,
            relatedIds: [`blocked-${task.id}`],
          });
        } else if (task.status !== "done" && task.dueDate) {
          // Due dates are calendar days: a task due today is not overdue until tomorrow in Helsinki.
          const due = Date.parse(`${task.dueDate.slice(0, 10)}T00:00:00Z`);
          const late = Math.round((today - due) / DAY);
          if (!Number.isNaN(due) && late >= FOLLOW_UP_RULES.overdue.after) {
            items.push({
              id: `follow-task-${task.id}`,
              kind: "overdue",
              title: task.title,
              detail: [where, task.assignee ? (task.assignee.kind === "human" ? task.assignee.name : null) : "Unassigned"].filter(Boolean).join(" · "),
              clientId: client.id,
              href: clientHref(client.id, `task-${task.id}`),
              since: new Date(due).toISOString(),
              waited: late,
              relatedIds: [`task-${task.id}`],
            });
          }
        }
      }

      // A project whose tasks are already waiting is listed through them, not a second time as quiet.
      if (project.status === "active" && items.length === before) {
        const ids = new Set([project.id, ...tasks.map((t) => t.id)]);
        // Only what a person did counts, as for client activity: agent and system events never keep a project "alive".
        const events = snapshot.activity.filter((e) => e.actor?.kind === "human" && (e.entityType === "project" || e.entityType === "task") && ids.has(e.entityId));
        push({
          id: `follow-project-${project.id}`,
          kind: "quiet_project",
          title: `${project.name} has gone quiet`,
          detail: `${client.name} · ${PROJECT_STAGE_LABELS[project.stage]}`,
          clientId: client.id,
          href: clientHref(client.id, `project-${project.id}`),
          since: latest(project.updatedAt, ...events.map((e) => e.timestamp), ...tasks.map((t) => t.updatedAt)),
          relatedIds: [],
        });
      }
    }

    if (running.length === 0) {
      const onboarding = snapshot.onboardings.find((o) => o.clientId === client.id && o.projectId === null);
      if (onboarding && onboarding.status !== "ready_for_review") {
        push({
          id: `follow-onboarding-${client.id}`,
          kind: "onboarding",
          title: `Onboarding for ${client.name}`,
          detail: "Saved but not finished",
          clientId: client.id,
          href: `/clients/${encodeURIComponent(client.id)}/onboarding`,
          since: onboarding.updatedAt,
          relatedIds: [`collect-${client.id}`],
        });
      } else if (!onboarding && getMissingEssentials(client).length > 0) {
        push({
          id: `follow-brief-${client.id}`,
          kind: "onboarding",
          title: `Brief for ${client.name}`,
          detail: "Not started",
          clientId: client.id,
          href: clientHref(client.id, "brief"),
          since: client.updatedAt,
          relatedIds: [`collect-${client.id}`],
        });
      } else if (onboarding?.completedAt) {
        const missing = getMissingEssentials(client).length;
        push({
          id: `follow-start-${client.id}`,
          kind: "start_project",
          title: `Start a project for ${client.name}`,
          detail: missing ? `Brief ready for review, ${missing === 1 ? "1 essential" : `${missing} essentials`} still missing` : "Brief ready for review",
          clientId: client.id,
          href: clientHref(client.id, "projects"),
          since: onboarding.completedAt,
          relatedIds: [`collect-${client.id}`, `start-${client.id}`],
        });
      }
    }
  }

  // Longest wait first, measured in time rather than in each rule's unit.
  return items.sort((a, b) => a.since.localeCompare(b.since));
}
