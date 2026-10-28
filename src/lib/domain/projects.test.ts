import { describe, expect, it } from "vitest";
import { buildNewClient } from "./clients";
import { buildProject, buildTask, setTaskStatus, suggestProjectName, updateProject, updateTaskDetails } from "./projects";
import { testDeps } from "./test-helpers";

const client = buildNewClient({ name: "Ateljé Henrik", projectType: "website_ecommerce" }, testDeps()).client;

describe("projects", () => {
  it("starts a project from just a name, planned and at intake", () => {
    const { project, event } = buildProject(client, { name: "  Shop  " }, testDeps());
    expect(project).toMatchObject({ name: "Shop", clientId: client.id, status: "planned", stage: "intake", projectType: "website_ecommerce" });
    expect(event.eventType).toBe("project.created");
    expect(() => buildProject(client, { name: "" }, testDeps())).toThrow();
  });

  it("suggests a name from what the client asked for", () => {
    expect(suggestProjectName(client)).toBe("Website & E-commerce");
  });

  it("keeps project status and stage independent", () => {
    const { project } = buildProject(client, { name: "Shop" }, testDeps());
    const staged = updateProject(project, { stage: "design" }, testDeps());
    expect(staged.project).toMatchObject({ stage: "design", status: "planned" });
    expect(staged.events.map((e) => e.eventType)).toEqual(["project.stage_changed"]);
    expect(updateProject(staged.project, { stage: "design" }, testDeps()).events).toHaveLength(0);
  });
});

describe("tasks", () => {
  const { project } = buildProject(client, { name: "Shop" }, testDeps());
  const { task } = buildTask(project, { title: "Product page design" }, testDeps());

  it("creates an unassigned to-do", () => {
    expect(task).toMatchObject({ status: "todo", assignee: null, projectId: project.id });
  });

  it("records completion and approval as different events", () => {
    expect(setTaskStatus(task, "done", testDeps()).events[0].eventType).toBe("task.completed");
    const waiting = { ...task, status: "awaiting_approval" as const };
    expect(setTaskStatus(waiting, "done", testDeps()).events[0]).toMatchObject({
      eventType: "decision.approved",
      description: "Approved Product page design",
    });
  });

  it("never lets an agent approve work", () => {
    const waiting = { ...task, status: "awaiting_approval" as const };
    expect(() => setTaskStatus(waiting, "done", testDeps({ kind: "agent", agentId: "qa" }))).toThrow(/only a person/i);
  });

  it("drops the blocked reason once a task is unblocked", () => {
    const blocked = { ...task, status: "blocked" as const, blockedReason: "Waiting for photos" };
    expect(setTaskStatus(blocked, "in_progress", testDeps()).task.blockedReason).toBeUndefined();
  });
});

describe("task owner, due date and blocked reason", () => {
  const project = buildProject(client, { name: "Shop" }, testDeps()).project;
  const task = buildTask(project, { title: "Product photos" }, testDeps()).task;

  it("assigns a person and a due date, with one event each", () => {
    const { task: next, events } = updateTaskDetails(task, { ownerName: " Sara ", ownerUserId: "user-1", dueDate: "2026-11-12" }, testDeps());
    expect(next.assignee).toEqual({ kind: "human", name: "Sara", userId: "user-1" });
    expect(next.dueDate).toBe("2026-11-12");
    expect(events.map((e) => [e.eventType, e.description])).toEqual([
      ["task.updated", "Product photos assigned to Sara"],
      ["task.updated", "Product photos due 2026-11-12"],
    ]);
  });

  it("clears owner and due date with empty values, and does nothing when unchanged", () => {
    const assigned = updateTaskDetails(task, { ownerName: "Sara", dueDate: "2026-11-12" }, testDeps()).task;
    expect(updateTaskDetails(assigned, { ownerName: "Sara", dueDate: "2026-11-12" }, testDeps()).events).toEqual([]);
    const cleared = updateTaskDetails(assigned, { ownerName: "", dueDate: "" }, testDeps());
    expect(cleared.task.assignee).toBeNull();
    expect(cleared.task.dueDate).toBeUndefined();
    expect(cleared.events.map((e) => e.description)).toEqual(["Product photos unassigned", "Product photos has no due date"]);
  });

  it("refuses an agent assigning work, and dates that do not exist", () => {
    expect(() => updateTaskDetails(task, { ownerName: "Sara", dueDate: "" }, testDeps({ kind: "agent", agentId: "coordination" }))).toThrow(/only a person/i);
    for (const dueDate of ["2026-02-30", "12.11.2026", "2026-1-5"]) {
      expect(() => updateTaskDetails(task, { ownerName: "", dueDate }, testDeps()), dueDate).toThrow(/date/);
    }
    expect(() => updateTaskDetails(task, { ownerName: "x".repeat(121), dueDate: "" }, testDeps())).toThrow(/under 120/);
  });

  it("keeps the reason a task is blocked, and drops it once unblocked", () => {
    const blocked = setTaskStatus(task, "blocked", testDeps(), { blockedReason: " Waiting for photos " });
    expect(blocked.task.blockedReason).toBe("Waiting for photos");
    expect(blocked.events[0].description).toBe("Product photos blocked: Waiting for photos");
    const newReason = setTaskStatus(blocked.task, "blocked", testDeps(), { blockedReason: "Waiting for copy" });
    expect(newReason.task.blockedReason).toBe("Waiting for copy");
    expect(newReason.events[0].eventType).toBe("task.updated");
    expect(setTaskStatus(newReason.task, "blocked", testDeps(), { blockedReason: "Waiting for copy" }).events).toEqual([]);
    expect(setTaskStatus(newReason.task, "in_progress", testDeps(), { blockedReason: "ignored" }).task.blockedReason).toBeUndefined();
    expect(() => setTaskStatus(task, "blocked", testDeps(), { blockedReason: "x".repeat(501) })).toThrow(/under 500/);
  });
});
