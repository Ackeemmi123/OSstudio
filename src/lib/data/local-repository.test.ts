import { describe, expect, it } from "vitest";
import { createSeedSnapshot } from "./seed";
import { LocalDemoRepository, STORAGE_KEY, type KeyValueStorage } from "./local-repository";
import { RepositoryError } from "./repository";
import { toClientUpdateInput } from "@/lib/domain/clients";

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
    expect(snapshot.activity[0]).toMatchObject({ eventType: "client.created", entityId: client.id });

    // A fresh repository over the same storage sees the new client.
    const reloaded = await repo(storage).load();
    expect(reloaded.clients.some((c) => c.id === client.id)).toBe(true);
  });

  it("rejects invalid input without saving", async () => {
    const repository = repo();
    await expect(repository.createClient({ name: "" })).rejects.toBeInstanceOf(RepositoryError);
    await expect(repository.createClient({ name: "X", email: "nope" })).rejects.toThrow(/email/i);
  });

  it("updates a client and appends activity", async () => {
    const repository = repo();
    const created = await repository.createClient({ name: "Lindgren Studio" });
    const input = toClientUpdateInput(created);
    input.contactPerson = "Ebba Lindgren";
    const updated = await repository.updateClient(created.id, input);
    const snapshot = await repository.load();

    expect(updated.contactPerson).toBe("Ebba Lindgren");
    expect(snapshot.activity[0]).toMatchObject({ eventType: "client.updated", entityId: created.id });
  });

  it("reports a missing client", async () => {
    const repository = repo();
    const created = await repository.createClient({ name: "Temp" });
    await expect(repository.updateClient("missing", toClientUpdateInput(created))).rejects.toMatchObject({ code: "not_found" });
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
