import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "@/lib/data/seed";
import {
  getActiveWork,
  getClientActivity,
  getClientRows,
  getDecisions,
  getNextActions,
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

  it("includes Ateljé Henrik with a Website & E-commerce project, marked as demo", () => {
    const henrik = snapshot.clients.find((c) => c.name === "Ateljé Henrik");
    expect(henrik?.isDemo).toBe(true);
    expect(snapshot.projects.find((p) => p.clientId === henrik?.id)?.projectType).toBe("website_ecommerce");
  });

  it("assigns no demo work to agents, because none are connected", () => {
    expect(snapshot.tasks.every((t) => t.assignee === null || t.assignee.kind === "human")).toBe(true);
  });
});

describe("getDecisions", () => {
  it("lists approvals, then reviews, then proposed client facts", () => {
    const decisions = getDecisions(snapshot);
    const kinds = decisions.map((d) => d.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => ["approval", "review", "proposal"].indexOf(a) - ["approval", "review", "proposal"].indexOf(b)));
    expect(decisions.filter((d) => d.kind === "approval")).toHaveLength(snapshot.tasks.filter((t) => t.status === "awaiting_approval").length);
    expect(decisions.some((d) => d.kind === "proposal" && d.clientId === "demo-atelje-henrik")).toBe(true);
  });
});

describe("getNextActions", () => {
  it("puts blocked work first and skips archived and paused clients", () => {
    const actions = getNextActions(snapshot);
    expect(actions[0].kind).toBe("blocked");
    expect(actions.some((a) => a.clientId === "demo-kontur" || a.clientId === "demo-fjallgard")).toBe(false);
  });

  it("asks to complete the brief for a new lead without projects", () => {
    const lumen = getNextActions(snapshot, "demo-lumen");
    expect(lumen).toEqual([expect.objectContaining({ kind: "collect", clientId: "demo-lumen" })]);
  });

  it("suggests the next open task for each running project, not tasks waiting on a decision", () => {
    const henrik = getNextActions(snapshot, "demo-atelje-henrik").filter((a) => a.kind === "task");
    expect(henrik).toHaveLength(1);
    expect(henrik[0].title).toBe("Product page design");
  });
});

describe("client rows", () => {
  it("uses the latest related event as last activity", () => {
    const henrik = getClientRows(snapshot).find((row) => row.client.id === "demo-atelje-henrik");
    expect(henrik?.lastActivity).toBe(getClientActivity("demo-atelje-henrik", snapshot)[0].timestamp);
  });

  it("describes each client's situation in one line", () => {
    const rows = new Map(getClientRows(snapshot).map((row) => [row.client.id, row.situation]));
    expect(rows.get("demo-atelje-henrik")).toBe("Website & E-commerce · Design");
    expect(rows.get("demo-lumen")).toBe("Lead · 5 details to collect");
    expect(rows.get("demo-fjallgard")).toBe("On hold");
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

describe("getActiveWork", () => {
  it("lists only active projects", () => {
    expect(getActiveWork(snapshot).every((w) => w.project.status === "active")).toBe(true);
  });
});
