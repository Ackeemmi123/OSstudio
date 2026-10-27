import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "./seed";
import { LEGACY_STORAGE_KEYS, LocalDemoRepository, STORAGE_KEY, type KeyValueStorage } from "./local-repository";
import { RepositoryError } from "./repository";
import { toClientDetailsInput } from "@/lib/domain/clients";

function memoryStorage(initial: Record<string, string> = {}): KeyValueStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    },
  };
}

function repo(storage: KeyValueStorage | null = memoryStorage()) {
  let n = 0;
  return new LocalDemoRepository({
    storage,
    seed: () => createSeedSnapshot(Date.parse("2026-10-26T12:00:00.000Z")),
    deps: { now: () => "2026-10-26T13:00:00.000Z", createId: () => `new-${++n}` },
  });
}

describe("LocalDemoRepository", () => {
  it("seeds an empty browser with demo data and saves it", async () => {
    const storage = memoryStorage();
    const snapshot = await repo(storage).load();
    expect(snapshot.clients.length).toBeGreaterThan(0);
    expect(storage.data[STORAGE_KEY]).toBeDefined();
  });

  it("creates a client with only a name and records a creation event", async () => {
    const storage = memoryStorage();
    const repository = repo(storage);
    const client = await repository.createClient({ name: "Lindgren Studio" });
    const snapshot = await repository.load();

    expect(snapshot.clients[0]).toEqual(client);
    expect(snapshot.activity[0]).toMatchObject({ eventType: "client.created", entityId: client.id, actor: { kind: "human", name: "You" } });
    expect((await repo(storage).load()).clients.some((c) => c.id === client.id)).toBe(true);
  });

  it("rejects invalid input without saving", async () => {
    const repository = repo();
    await expect(repository.createClient({ name: "" })).rejects.toBeInstanceOf(RepositoryError);
    await expect(repository.createClient({ name: "X", email: "nope" })).rejects.toThrow(/email/i);
    await expect(repository.createProject("demo-lumen", { name: " " })).rejects.toMatchObject({ code: "validation" });
  });

  it("updates details and context separately, each with activity", async () => {
    const repository = repo();
    const created = await repository.createClient({ name: "Lindgren Studio" });
    await repository.updateClient(created.id, { ...toClientDetailsInput(created), contactPerson: "Ebba Lindgren" });
    const updated = await repository.setContextField(created.id, "budget", { value: "SEK 90,000", confidence: "observed" });
    const snapshot = await repository.load();

    expect(updated).toMatchObject({ contactPerson: "Ebba Lindgren", context: { budget: { value: "SEK 90,000" } } });
    expect(snapshot.activity.slice(0, 2).map((e) => e.eventType)).toEqual(["client.context_updated", "client.updated"]);
  });

  it("creates a project and a task, and approves work", async () => {
    const repository = repo();
    const project = await repository.createProject("demo-lumen", { name: "Website" });
    const task = await repository.createTask(project.id, { title: "Call the clinic" });
    await repository.setTaskStatus("demo-t-3", "done");
    const snapshot = await repository.load();

    expect(snapshot.projects.find((p) => p.id === project.id)).toMatchObject({ clientId: "demo-lumen", status: "planned" });
    expect(snapshot.tasks.find((t) => t.id === task.id)).toMatchObject({ status: "todo" });
    expect(snapshot.activity[0]).toMatchObject({ eventType: "decision.approved", entityId: "demo-t-3" });
  });

  it("does not save or log anything when nothing changed", async () => {
    const repository = repo();
    const before = await repository.load();
    await repository.setTaskStatus("demo-t-3", "awaiting_approval");
    expect(await repository.load()).toBe(before);
  });

  it("reports a missing record", async () => {
    await expect(repo().setTaskStatus("missing", "done")).rejects.toMatchObject({ code: "not_found" });
  });

  it("migrates a workspace saved by the first version", async () => {
    const v1 = createSeedSnapshot(Date.parse("2026-10-26T12:00:00.000Z")) as unknown as Record<string, Record<string, unknown>[]>;
    v1.tasks = v1.tasks.map(({ assignee, ...task }) => ({ ...task, assignedTo: (assignee as { name?: string } | null)?.name ?? null }));
    v1.activity = v1.activity.map((event) => ({ ...event, actor: (event.actor as { name?: string } | undefined)?.name }));
    v1.clients = [{ ...v1.clients[0], id: "mine", name: "Created in v1" }, ...v1.clients];
    const storage = memoryStorage({ [LEGACY_STORAGE_KEYS[0]]: JSON.stringify(v1) });

    const snapshot = await repo(storage).load();
    expect(snapshot.clients[0].name).toBe("Created in v1");
    expect(snapshot.tasks.find((t) => t.id === "demo-t-3")?.assignee).toEqual({ kind: "human", name: "Sara" });
    expect(snapshot.activity[0].actor).toEqual({ kind: "human", name: "Alex" });
    expect(storage.data[STORAGE_KEY]).toBeDefined();
  });

  it("falls back to demo data when stored data is corrupt", async () => {
    const snapshot = await repo(memoryStorage({ [STORAGE_KEY]: "{not json" })).load();
    expect(snapshot.clients.length).toBeGreaterThan(0);
  });

  it("leaves data unchanged when saving fails", async () => {
    const storage = memoryStorage();
    const repository = repo(storage);
    const before = await repository.load();
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    await expect(repository.createClient({ name: "Will fail" })).rejects.toMatchObject({ code: "storage" });
    expect(await repository.load()).toBe(before);
  });

  it("works in memory when browser storage is unavailable", async () => {
    const repository = repo(null);
    expect(repository.info.persistence).toBe("memory");
    await repository.createClient({ name: "In memory" });
    expect((await repository.load()).clients[0].name).toBe("In memory");
  });
});
