import { describe, expect, it } from "vitest";
import { buildNewClient } from "./clients";
import { buildProject, buildTask, setTaskStatus, suggestProjectName, updateProject } from "./projects";
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
