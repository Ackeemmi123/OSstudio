import { describe, expect, it } from "vitest";
import type { StudioSnapshot } from "@/lib/domain/types";
import { deterministicId, hasImportableData, planImport, verifyImport } from "./browser-import";
import { LocalDemoRepository } from "./local-repository";
import { createSeedSnapshot } from "./seed";

const STUDIO = "6f0e9a52-4a43-4c39-8f8e-1f2d3c4b5a69";

async function localWorkspace(): Promise<StudioSnapshot> {
  let n = 0;
  const repository = new LocalDemoRepository({
    storage: null,
    seed: () => createSeedSnapshot(Date.parse("2026-10-26T12:00:00.000Z")),
    deps: { now: () => "2026-10-26T13:00:00.000Z", createId: () => `local-${++n}`, actor: { kind: "human", name: "You" } },
  });
  const client = await repository.createClient({ name: "Real Client AB", budget: "50k", email: "info@real.test" });
  await repository.setContextField(client.id, "goal", { value: "More bookings", confidence: "confirmed" });
  const project = await repository.createProject(client.id, { name: "Booking site" });
  await repository.createTask(project.id, { title: "Draft sitemap" });
  await repository.addSource(client.id, { type: "email", label: "Intro email", content: "Hi, we want more bookings." });
  return repository.load();
}

describe("browser import", () => {
  it("imports what people entered and leaves demo records out", async () => {
    const snapshot = await localWorkspace();
    expect(hasImportableData(snapshot)).toBe(true);
    expect(hasImportableData(createSeedSnapshot())).toBe(false);

    const plan = await planImport(snapshot, STUDIO);
    expect(plan.counts).toMatchObject({ clients: 1, projects: 1, tasks: 1, sources: 1 });
    expect(plan.demoRecords).toBeGreaterThan(0);
    expect(plan.payload.clients[0]).toMatchObject({ name: "Real Client AB" });
    expect(plan.payload.context_fields).toHaveLength(6);
    // Activity about demo records is not imported.
    expect(plan.payload.activity.length).toBe(plan.counts.activity);
    expect(plan.skippedActivity).toBeGreaterThan(0);
  });

  it("marks imported history instead of crediting the person importing", async () => {
    const plan = await planImport(await localWorkspace(), STUDIO);
    for (const event of plan.payload.activity) expect(event.actor).toMatchObject({ kind: "human", name: "You", imported: true });
    const goal = plan.payload.context_fields.find((f) => f.field_key === "goal")!;
    expect(goal).toMatchObject({ confidence: "confirmed", confirmed_by: { kind: "human", name: "You", imported: true } });
  });

  it("produces the same identifiers and hash for the same data, and different ones per studio", async () => {
    const snapshot = await localWorkspace();
    const [a, b] = await Promise.all([planImport(snapshot, STUDIO), planImport(snapshot, STUDIO)]);
    expect(a.hash).toBe(b.hash);
    expect(a.expected).toEqual(b.expected);
    const other = await planImport(snapshot, "0d6f3e0a-0000-4000-8000-000000000000");
    expect(other.expected.clients[0]).not.toBe(a.expected.clients[0]);
    expect(await deterministicId(STUDIO, "client", "x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("skips invalid records, and their children, with a reason", async () => {
    const snapshot = await localWorkspace();
    const broken = structuredClone(snapshot);
    const client = broken.clients.find((c) => !c.isDemo)!;
    client.context.budget = { value: null, confidence: "confirmed", updatedAt: "2026-10-26T13:00:00.000Z" };
    const plan = await planImport(broken, STUDIO);
    expect(plan.counts.clients).toBe(0);
    expect(plan.counts.projects).toBe(0);
    expect(plan.skipped.map((s) => s.kind)).toEqual(["client", "project", "task", "source"]);
    expect(plan.skipped[0].reason).toContain("budget");
  });

  it("verifies that every record came back from the server", async () => {
    const plan = await planImport(await localWorkspace(), STUDIO);
    const empty: StudioSnapshot = { clients: [], projects: [], tasks: [], activity: [], sources: [], agentRuns: [], proposals: [] };
    expect(verifyImport(plan, empty)).toEqual({ ok: false, missing: 3 });
    const present = {
      ...empty,
      clients: plan.expected.clients.map((id) => ({ id })),
      projects: plan.expected.projects.map((id) => ({ id })),
      tasks: plan.expected.tasks.map((id) => ({ id })),
    } as unknown as StudioSnapshot;
    expect(verifyImport(plan, present)).toEqual({ ok: true, missing: 0 });
  });
});
