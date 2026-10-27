import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "@/lib/data/seed";
import {
  getAttentionItems,
  getClientActivity,
  getClientNextSteps,
  getClientRows,
  getDashboardSummary,
  matchesClientQuery,
} from "./insights";

const NOW = Date.parse("2026-10-26T12:00:00.000Z");
const snapshot = createSeedSnapshot(NOW);

describe("seed data", () => {
  it("references only existing clients, projects and tasks", () => {
    const clientIds = new Set(snapshot.clients.map((c) => c.id));
    const projectIds = new Set(snapshot.projects.map((p) => p.id));
    const taskIds = new Set(snapshot.tasks.map((t) => t.id));
    expect(snapshot.projects.every((p) => clientIds.has(p.clientId))).toBe(true);
    expect(snapshot.tasks.every((t) => projectIds.has(t.projectId))).toBe(true);
    for (const event of snapshot.activity) {
      const ids = { client: clientIds, project: projectIds, task: taskIds }[event.entityType];
      expect(ids.has(event.entityId), event.id).toBe(true);
    }
  });

  it("includes Ateljé Henrik with a Website & E-commerce project", () => {
    const henrik = snapshot.clients.find((c) => c.name === "Ateljé Henrik");
    expect(henrik?.isDemo).toBe(true);
    expect(snapshot.projects.find((p) => p.clientId === henrik?.id)?.projectType).toBe("website_ecommerce");
  });
});

describe("getDashboardSummary", () => {
  it("derives every metric from the snapshot", () => {
    const summary = getDashboardSummary(snapshot);
    expect(summary.activeProjects).toHaveLength(snapshot.projects.filter((p) => p.status === "active").length);
    expect(summary.openTasks).toBe(snapshot.tasks.filter((t) => t.status !== "done").length);
    expect(summary.pendingApprovals).toBe(snapshot.tasks.filter((t) => t.status === "awaiting_approval").length);
    expect(summary.attention.length).toBe(getAttentionItems(snapshot).length);
  });
});

describe("getAttentionItems", () => {
  it("puts blocked work first and skips archived clients", () => {
    const items = getAttentionItems(snapshot);
    expect(items[0].kind).toBe("blocked");
    expect(items.some((item) => item.clientId === "demo-kontur" && item.kind === "missing_info")).toBe(false);
    expect(items.some((item) => item.clientId === "demo-lumen" && item.kind === "missing_info")).toBe(true);
  });
});

describe("client rows", () => {
  it("uses the latest related event as last activity", () => {
    const henrik = getClientRows(snapshot).find((row) => row.client.id === "demo-atelje-henrik");
    const latest = getClientActivity("demo-atelje-henrik", snapshot)[0];
    expect(henrik?.lastActivity).toBe(latest.timestamp);
  });

  it("searches by name, contact, email and project name", () => {
    const rows = getClientRows(snapshot);
    const search = (q: string) => rows.filter((row) => matchesClientQuery(row, q)).map((row) => row.client.id);
    expect(search("henrik")).toContain("demo-atelje-henrik");
    expect(search("JONAS")).toEqual(["demo-solberg"]);
    expect(search("subscription shop")).toEqual(["demo-solberg"]);
    expect(search("")).toHaveLength(snapshot.clients.length);
  });
});

describe("getClientNextSteps", () => {
  it("asks for missing essentials and suggests a first project for a new lead", () => {
    const lumen = snapshot.clients.find((c) => c.id === "demo-lumen")!;
    const steps = getClientNextSteps(lumen, snapshot).map((s) => s.id);
    expect(steps[0]).toBe("missing");
    expect(steps).toContain("project");
  });
});
