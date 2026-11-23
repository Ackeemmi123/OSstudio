/** The warmer-text runner, with the test provider and an in-memory store. Every client and text is invented. */
import { describe, expect, it } from "vitest";
import { warmTextResultOf } from "@/lib/agents/contract";
import { warmTextCandidates } from "@/lib/agents/warm-text";
import { buildNewClient } from "@/lib/domain/clients";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Client, SiteSpecRecord, SourceDocument } from "@/lib/domain/types";
import { companySpec } from "@/lib/site-spec/test-helpers";
import { FixtureModel } from "./fixture-model";
import { MemoryStore, NOW } from "./testing/memory-store";
import { runWarmText, type WarmTextStore } from "./warm-text-runner";

const WARM = { id: "design", taskType: "design.warm_text" } as const;

class WarmStore extends MemoryStore implements WarmTextStore {
  record: SiteSpecRecord | null = null;
  async loadSpec(specId: string) {
    return this.record && this.record.id === specId ? this.record : null;
  }
}

function setup() {
  const client: Client = buildNewClient({ name: "Kafé Testgränd (TEST)", sourceType: "email" }, testDeps()).client;
  const sources: SourceDocument[] = [{ id: "src-1", clientId: client.id, type: "email", label: "Mejl från Sara (TEST)", content: "Vi bakar allt själva varje morgon.", receivedAt: "2026-11-01T10:00:00.000Z" }];
  const store = new WarmStore(client, sources, WARM);
  store.record = {
    id: "spec-1",
    clientId: client.id,
    projectId: "project-1",
    version: 3,
    basedOn: null,
    status: "draft",
    spec: companySpec(),
    createdBy: { kind: "human", name: "Alex" },
    submittedBy: null,
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    reviewNote: null,
    createdAt: "2026-11-20T10:00:00.000Z",
    updatedAt: "2026-11-20T10:00:00.000Z",
  };
  return store;
}

const pass = (store: WarmStore, overrides: Partial<Parameters<typeof runWarmText>[0]> = {}) =>
  runWarmText({ store, model: new FixtureModel(), clientId: store.client!.id, projectId: "project-1", specId: "spec-1", requestedBy: "user-1", timeoutMs: 5_000, capMicros: 25_000_000, now: () => NOW, ...overrides });

describe("runWarmText", () => {
  it("stores checked proposals on the run, dropping the one that adds a fact", async () => {
    const store = setup();
    const outcome = await pass(store);
    const run = outcome.body.run!;
    expect(run).toMatchObject({ agentId: "design", taskType: "design.warm_text", status: "needs_approval", runner: "fixture" });
    const result = warmTextResultOf(run)!;
    const [first] = warmTextCandidates(store.record!.spec);
    expect(result).toMatchObject({ specId: "spec-1", specVersion: 3 });
    expect(result.suggestions).toEqual([expect.objectContaining({ path: first.path, before: first.text })]);
    expect(result.dropped).toEqual([expect.objectContaining({ reason: expect.stringContaining("1999") })]);
    expect(run.inputs).toContainEqual({ type: "artifact", id: "spec-1", label: "Website spec, version 3" });
    expect(run.inputs).toContainEqual({ type: "source", id: "src-1", label: "Mejl från Sara (TEST)" });
    expect(store.events).toEqual(["agent.run_started", "agent.run_completed"]);
  });

  it("reuses the proposals for the same texts and runs again on request", async () => {
    const store = setup();
    const first = await pass(store);
    expect((await pass(store)).body).toMatchObject({ reused: true, run: { id: first.body.run!.id } });
    expect((await pass(store, { force: true })).body.run!.id).not.toBe(first.body.run!.id);
  });

  it("asks for texts before calling the model", async () => {
    const store = setup();
    store.record!.spec.pages = store.record!.spec.pages.slice(0, 1);
    store.record!.spec.pages[0].sections = [];
    const outcome = await pass(store);
    expect(outcome.body.run).toMatchObject({ status: "needs_input", blocker: expect.stringContaining("too little text") });
    expect(store.events).toEqual([]);
  });

  it("refuses a spec of another client or project", async () => {
    const store = setup();
    expect((await pass(store, { projectId: "project-2" })).status).toBe(404);
    expect((await pass(store, { specId: "spec-9" })).status).toBe(404);
  });

  it("stays within the monthly budget", async () => {
    const store = setup();
    store.spentMicros = 25_000_000;
    const outcome = await pass(store, { model: Object.assign(new FixtureModel(), { model: "claude-opus-5-5" }) });
    expect(outcome.body.run).toMatchObject({ status: "failed", error: { message: expect.stringContaining("budget") } });
  });
});
