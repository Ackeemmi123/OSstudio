import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "@/lib/data/seed";
import { buildNewClient } from "./clients";
import { daysBetween, describeWait, FOLLOW_UP_RULES, getFollowUps, workingDaysBetween } from "./followups";
import { getDecisions, getNextActions } from "./insights";
import { buildOnboarding } from "./onboarding";
import { buildProject, buildTask } from "./projects";
import { testDeps } from "./test-helpers";
import type { Client, Inquiry, Onboarding, Project, StudioSnapshot, Task } from "./types";

// Wednesday 28 October 2026, 14:00 in Helsinki.
const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

function empty(): StudioSnapshot {
  return { clients: [], projects: [], tasks: [], activity: [], sources: [], agentRuns: [], proposals: [], onboardings: [], inquiries: [] };
}

function inquiry(overrides: Partial<Inquiry> = {}): Inquiry {
  return {
    id: "inq-1",
    status: "new",
    isTest: true,
    locale: "en",
    contactName: "Maja Lind",
    email: "maja@example.com",
    company: "Lumen Yoga (test)",
    website: null,
    service: "websites",
    projectType: "website",
    budget: null,
    budgetAmount: null,
    timeline: null,
    desiredDate: null,
    message: "We would like a new website.",
    receivedAt: "2026-10-26T09:00:00.000Z",
    clientId: null,
    createdClient: false,
    decidedBy: null,
    decidedAt: null,
    decisionReason: null,
    ...overrides,
  };
}

function client(name = "Nordvik", overrides: Partial<Client> = {}): Client {
  return { ...buildNewClient({ name }, testDeps()).client, id: `client-${name}`, status: "active", ...overrides };
}

function project(c: Client, overrides: Partial<Project> = {}): Project {
  return { ...buildProject(c, { name: "Website" }, testDeps()).project, id: `project-${c.id}`, status: "active", updatedAt: ago(1), ...overrides };
}

function task(p: Project, overrides: Partial<Task> = {}): Task {
  return { ...buildTask(p, { title: "Homepage design" }, testDeps()).task, id: `task-${p.id}`, updatedAt: ago(1), ...overrides };
}

function onboarding(c: Client, overrides: Partial<Onboarding> = {}): Onboarding {
  return { ...buildOnboarding(c, testDeps()).onboarding, id: `onb-${c.id}`, ...overrides };
}

describe("workingDaysBetween", () => {
  it("counts Monday to Friday after the start day, up to today", () => {
    expect(workingDaysBetween(Date.parse("2026-10-27T09:00:00Z"), NOW)).toBe(1); // Tue -> Wed
    expect(workingDaysBetween(Date.parse("2026-10-26T09:00:00Z"), NOW)).toBe(2); // Mon -> Wed
    expect(workingDaysBetween(Date.parse("2026-10-23T09:00:00Z"), NOW)).toBe(3); // Fri -> Wed, weekend skipped
    expect(workingDaysBetween(Date.parse("2026-10-24T09:00:00Z"), NOW)).toBe(3); // Sat -> Wed
    expect(workingDaysBetween(NOW, NOW)).toBe(0);
  });

  it("uses the calendar day in Helsinki, not in UTC", () => {
    // 22:30 UTC on Tuesday is already 00:30 on Wednesday in Helsinki.
    const helsinkiWednesday = Date.parse("2026-10-27T22:30:00Z");
    expect(workingDaysBetween(Date.parse("2026-10-26T09:00:00Z"), helsinkiWednesday)).toBe(2);
    // 23:30 UTC on Friday is Saturday in Helsinki, so Monday is the first working day after it.
    expect(workingDaysBetween(Date.parse("2026-10-23T23:30:00Z"), Date.parse("2026-10-26T09:00:00Z"))).toBe(1);
  });
});

describe("daysBetween", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysBetween(NOW - 3 * DAY + 1, NOW)).toBe(2);
    expect(daysBetween(NOW - 3 * DAY, NOW)).toBe(3);
    expect(daysBetween(NOW + DAY, NOW)).toBe(0);
  });
});

describe("getFollowUps: inquiries", () => {
  it("flags a new inquiry after 2 working days, not before", () => {
    const due = { ...empty(), inquiries: [inquiry()] };
    expect(getFollowUps(due, NOW)).toEqual([
      expect.objectContaining({ kind: "inquiry", waited: 2, clientId: null, href: "/inquiries/inq-1", relatedIds: ["inquiry-inq-1"] }),
    ]);
    const fresh = { ...empty(), inquiries: [inquiry({ receivedAt: "2026-10-27T09:00:00.000Z" })] };
    expect(getFollowUps(fresh, NOW)).toEqual([]);
  });

  it("ignores decided inquiries", () => {
    const decided = (["approved", "rejected", "spam", "merged"] as const).map((status, i) => inquiry({ id: `inq-${i}`, status }));
    expect(getFollowUps({ ...empty(), inquiries: decided }, NOW)).toEqual([]);
  });

  it("leaves inquiries out of a single client's follow-ups", () => {
    const c = client();
    expect(getFollowUps({ ...empty(), clients: [c], inquiries: [inquiry()] }, NOW, c.id)).toEqual([]);
  });
});

describe("getFollowUps: tasks", () => {
  const c = client();
  const p = project(c);

  it("flags approvals and reviews after 2 working days", () => {
    const approval = task(p, { id: "t-approve", status: "awaiting_approval", updatedAt: "2026-10-26T09:00:00.000Z" });
    const review = task(p, { id: "t-review", status: "in_review", updatedAt: "2026-10-26T09:00:00.000Z" });
    const recent = task(p, { id: "t-recent", status: "awaiting_approval", updatedAt: "2026-10-27T09:00:00.000Z" });
    const found = getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [approval, review, recent] }, NOW);
    expect(found.map((f) => [f.kind, f.relatedIds[0]])).toEqual([
      ["approval", "task-t-approve"],
      ["review", "task-t-review"],
    ]);
  });

  it("flags a blocked task after 3 days, with its reason", () => {
    const blocked = task(p, { status: "blocked", blockedReason: "Waiting for photos", updatedAt: ago(3) });
    const [item] = getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [blocked] }, NOW);
    expect(item).toMatchObject({ kind: "blocked", waited: 3, detail: "Waiting for photos", relatedIds: [`blocked-${blocked.id}`] });
    const notYet = task(p, { status: "blocked", updatedAt: ago(2.9) });
    expect(getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [notYet] }, NOW)).toEqual([]);
  });

  it("flags an open task the day after its due date, in Helsinki", () => {
    const due = task(p, { status: "in_progress", dueDate: "2026-10-27", assignee: { kind: "human", name: "Sara" } });
    const [item] = getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [due] }, NOW);
    expect(item).toMatchObject({ kind: "overdue", waited: 1, relatedIds: [`task-${due.id}`] });
    expect(item.detail).toContain("Sara");
    expect(getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [{ ...due, dueDate: "2026-10-28" }] }, NOW)).toEqual([]);
    expect(getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [{ ...due, status: "done" }] }, NOW)).toEqual([]);
    // 22:30 UTC on 27 October is already the 28th in Helsinki.
    expect(getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [due] }, Date.parse("2026-10-27T22:30:00Z"))).toHaveLength(1);
  });

  it("lists a blocked task that is also overdue once, as blocked", () => {
    const both = task(p, { status: "blocked", dueDate: "2026-10-01", updatedAt: ago(5) });
    expect(getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [both] }, NOW).map((f) => f.kind)).toEqual(["blocked"]);
  });

  it("ignores tasks in completed or paused projects, and paused or archived clients", () => {
    const stuck = (pr: Project) => task(pr, { status: "blocked", updatedAt: ago(10) });
    const done = project(c, { id: "p-done", status: "completed" });
    const held = project(c, { id: "p-held", status: "on_hold" });
    expect(getFollowUps({ ...empty(), clients: [c], projects: [done, held], tasks: [stuck(done), stuck(held)] }, NOW)).toEqual([]);
    for (const status of ["on_hold", "archived"] as const) {
      const other = client("Paused", { status });
      const pr = project(other);
      expect(getFollowUps({ ...empty(), clients: [other], projects: [pr], tasks: [stuck(pr)] }, NOW)).toEqual([]);
    }
  });
});

describe("getFollowUps: quiet projects", () => {
  const c = client();

  it("flags an active project with no activity for 10 days", () => {
    const p = project(c, { updatedAt: ago(12) });
    const [item] = getFollowUps({ ...empty(), clients: [c], projects: [p] }, NOW);
    expect(item).toMatchObject({ kind: "quiet_project", waited: 12, relatedIds: [] });
  });

  it("counts project events, task events and task changes as activity", () => {
    const p = project(c, { updatedAt: ago(30) });
    const t = task(p, { status: "todo", updatedAt: ago(30) });
    const base = { ...empty(), clients: [c], projects: [p], tasks: [t] };
    expect(getFollowUps(base, NOW)).toHaveLength(1);

    const note = { id: "e1", entityType: "project" as const, entityId: p.id, eventType: "note.added" as const, description: "Call", timestamp: ago(2), actor: { kind: "human" as const, name: "Alex" } };
    expect(getFollowUps({ ...base, activity: [note] }, NOW)).toEqual([]);
    const taskEvent = { ...note, entityType: "task" as const, entityId: t.id, eventType: "task.status_changed" as const };
    expect(getFollowUps({ ...base, activity: [taskEvent] }, NOW)).toEqual([]);
    expect(getFollowUps({ ...base, tasks: [{ ...t, updatedAt: ago(1) }] }, NOW)).toEqual([]);
    // Agent and system events do not count, nor do another project's.
    expect(getFollowUps({ ...base, activity: [{ ...note, actor: { kind: "agent", agentId: "research" } }] }, NOW)).toHaveLength(1);
    expect(getFollowUps({ ...base, activity: [{ ...note, actor: { kind: "system" } }] }, NOW)).toHaveLength(1);
    const elsewhere = { ...note, entityId: "another-project" };
    expect(getFollowUps({ ...base, activity: [elsewhere] }, NOW)).toHaveLength(1);
  });

  it("lists a project through its waiting tasks rather than as quiet as well", () => {
    const p = project(c, { updatedAt: ago(30) });
    const blocked = task(p, { status: "blocked", updatedAt: ago(30) });
    expect(getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [blocked] }, NOW).map((f) => f.kind)).toEqual(["blocked"]);
  });

  it("does not flag planned projects as quiet", () => {
    const p = project(c, { status: "planned", updatedAt: ago(30) });
    expect(getFollowUps({ ...empty(), clients: [c], projects: [p] }, NOW)).toEqual([]);
  });
});

describe("getFollowUps: onboarding and starting a project", () => {
  const lead = client("Lumen", { status: "onboarding" });

  it("flags an onboarding left untouched for 5 days", () => {
    const o = onboarding(lead, { status: "in_progress", updatedAt: ago(5) });
    const [item] = getFollowUps({ ...empty(), clients: [lead], onboardings: [o] }, NOW);
    expect(item).toMatchObject({ kind: "onboarding", waited: 5, href: `/clients/${lead.id}/onboarding`, relatedIds: [`collect-${lead.id}`] });
    expect(getFollowUps({ ...empty(), clients: [lead], onboardings: [{ ...o, updatedAt: ago(4) }] }, NOW)).toEqual([]);
  });

  it("flags a brief that was never started, 5 days after the client last changed", () => {
    const quiet = { ...lead, updatedAt: ago(5) };
    const [item] = getFollowUps({ ...empty(), clients: [quiet] }, NOW);
    expect(item).toMatchObject({ kind: "onboarding", detail: "Not started", relatedIds: [`collect-${lead.id}`] });
    expect(getFollowUps({ ...empty(), clients: [{ ...lead, updatedAt: ago(4) }] }, NOW)).toEqual([]);
  });

  it("flags a finished brief with no project after 3 days", () => {
    const o = onboarding(lead, { status: "ready_for_review", updatedAt: ago(3), completedAt: ago(3) });
    const [item] = getFollowUps({ ...empty(), clients: [lead], onboardings: [o] }, NOW);
    expect(item).toMatchObject({ kind: "start_project", waited: 3, relatedIds: [`collect-${lead.id}`, `start-${lead.id}`] });
    expect(item.detail).toMatch(/essentials still missing/);
  });

  it("stops once a project is running", () => {
    const o = onboarding(lead, { status: "ready_for_review", completedAt: ago(10) });
    const p = project(lead, { status: "planned", updatedAt: ago(1) });
    expect(getFollowUps({ ...empty(), clients: [lead], projects: [p], onboardings: [o] }, NOW)).toEqual([]);
  });
});

describe("getFollowUps: overall", () => {
  it("lists the longest wait first", () => {
    const c = client();
    const p = project(c, { updatedAt: ago(1) });
    const blocked = task(p, { status: "blocked", updatedAt: ago(20) });
    const found = getFollowUps({ ...empty(), clients: [c], projects: [p], tasks: [blocked], inquiries: [inquiry()] }, NOW);
    expect(found.map((f) => f.kind)).toEqual(["blocked", "inquiry"]);
  });

  it("points only at decisions and next actions that exist", () => {
    const snapshot = createSeedSnapshot(NOW);
    const later = NOW + 30 * DAY;
    const known = new Set([...getDecisions(snapshot).map((d) => d.id), ...getNextActions(snapshot).map((a) => a.id)]);
    const found = getFollowUps(snapshot, later);
    expect(found.length).toBeGreaterThan(0);
    for (const item of found) {
      expect(item.relatedIds.some((id) => known.has(id)) || item.relatedIds.length === 0, item.id).toBe(true);
    }
  });

  it("changes nothing in the snapshot", () => {
    const snapshot = createSeedSnapshot(NOW);
    const before = JSON.stringify(snapshot);
    getFollowUps(snapshot, NOW + 30 * DAY);
    expect(JSON.stringify(snapshot)).toBe(before);
  });

  it("has a threshold of at least one for every rule", () => {
    expect(Object.values(FOLLOW_UP_RULES).every((rule) => rule.after >= 1)).toBe(true);
  });
});

describe("describeWait", () => {
  it("says how long, in the rule's unit", () => {
    expect(describeWait({ kind: "inquiry", waited: 2 })).toBe("Waiting 2 working days");
    expect(describeWait({ kind: "approval", waited: 1 })).toBe("Waiting 1 working day");
    expect(describeWait({ kind: "blocked", waited: 4 })).toBe("Blocked for 4 days");
    expect(describeWait({ kind: "overdue", waited: 2 })).toBe("Overdue by 2 days");
    expect(describeWait({ kind: "quiet_project", waited: 12 })).toBe("No activity for 12 days");
    expect(describeWait({ kind: "onboarding", waited: 6 })).toBe("Untouched for 6 days");
    expect(describeWait({ kind: "start_project", waited: 3 })).toBe("Brief ready for 3 days");
  });
});
