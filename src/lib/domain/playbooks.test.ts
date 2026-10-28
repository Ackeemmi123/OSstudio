import { describe, expect, it } from "vitest";
import { buildNewClient } from "./clients";
import { PLAYBOOK_MAX_TASKS, PLAYBOOKS } from "./playbooks";
import { buildProject, TITLE_MAX_LENGTH } from "./projects";
import { testDeps } from "./test-helpers";
import { PROJECT_STAGES, PROJECT_TYPES } from "./types";

describe("playbooks", () => {
  it("has a list for every project type, with valid, unique titles", () => {
    for (const type of PROJECT_TYPES) {
      const titles = PLAYBOOKS[type].map((task) => task.title);
      expect(titles.length, type).toBeGreaterThan(0);
      expect(titles.length, type).toBeLessThanOrEqual(PLAYBOOK_MAX_TASKS);
      expect(new Set(titles).size, type).toBe(titles.length);
      for (const task of PLAYBOOKS[type]) {
        expect(PROJECT_STAGES).toContain(task.stage);
        expect(task.title.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH);
      }
    }
  });

  it("keeps tasks in delivery order, from intake to launch", () => {
    for (const type of PROJECT_TYPES) {
      const order = PLAYBOOKS[type].map((task) => PROJECT_STAGES.indexOf(task.stage));
      expect(order, type).toEqual([...order].sort((a, b) => a - b));
      expect(PLAYBOOKS[type][0].stage, type).toBe("intake");
    }
  });
});

describe("buildProject with tasks", () => {
  const client = buildNewClient({ name: "Lumen", projectType: "website" }, testDeps()).client;

  it("creates each task once, as to do, in one project event", () => {
    const { project, tasks, event } = buildProject(client, { name: "Website", tasks: ["Kickoff call", " Kickoff call ", "Page designs"] }, testDeps());
    expect(tasks.map((t) => [t.title, t.status, t.projectId, t.assignee])).toEqual([
      ["Kickoff call", "todo", project.id, null],
      ["Page designs", "todo", project.id, null],
    ]);
    expect(event).toMatchObject({ eventType: "project.created", description: "Started project Website with 2 tasks" });
  });

  it("still starts a project with no tasks", () => {
    const { tasks, event } = buildProject(client, { name: "Website" }, testDeps());
    expect(tasks).toEqual([]);
    expect(event.description).toBe("Started project Website");
  });

  it("refuses empty or too many tasks", () => {
    expect(() => buildProject(client, { name: "Website", tasks: ["  "] }, testDeps())).toThrow(/task/);
    const many = Array.from({ length: PLAYBOOK_MAX_TASKS + 1 }, (_, i) => `Task ${i}`);
    expect(() => buildProject(client, { name: "Website", tasks: many }, testDeps())).toThrow(/at most/);
  });
});
