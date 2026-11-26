import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "@/lib/data/seed";
import { countTestClients, isTestClient, withoutTestClients } from "./test-clients";

describe("test clients", () => {
  it("are named with (TEST), in any case", () => {
    expect(isTestClient({ name: "Leipomo Rantala (TEST)" })).toBe(true);
    expect(isTestClient({ name: "Bageri (test)" })).toBe(true);
    expect(isTestClient({ name: "Testlunds Snickeri" })).toBe(false);
  });

  it("leave Today with everything that belongs to them, and nothing else", () => {
    const snapshot = createSeedSnapshot(Date.parse("2026-11-26T12:00:00.000Z"));
    const test = snapshot.clients[0];
    const real = snapshot.clients.slice(1);
    const marked = { ...snapshot, clients: [{ ...test, name: `${test.name} (TEST)` }, ...real] };
    const testProjects = new Set(snapshot.projects.filter((p) => p.clientId === test.id).map((p) => p.id));
    const testTasks = new Set(snapshot.tasks.filter((t) => testProjects.has(t.projectId)).map((t) => t.id));

    const shown = withoutTestClients(marked);
    expect(shown.clients.map((c) => c.id)).toEqual(real.map((c) => c.id));
    expect(shown.projects.some((p) => p.clientId === test.id)).toBe(false);
    expect(shown.tasks.some((t) => testTasks.has(t.id))).toBe(false);
    expect(shown.activity.some((e) => e.entityId === test.id || testProjects.has(e.entityId) || testTasks.has(e.entityId))).toBe(false);
    expect(shown.projects.length).toBe(snapshot.projects.filter((p) => p.clientId !== test.id).length);
    expect(countTestClients(marked)).toBe(1);
    // Without test clients the snapshot is the same object.
    expect(withoutTestClients(snapshot)).toBe(snapshot);
  });
});
