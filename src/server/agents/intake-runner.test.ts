import { describe, expect, it } from "vitest";
import type { AgentRunRecord } from "@/lib/agents/contract";
import type { IntakeInput } from "@/lib/agents/intake";
import { buildNewClient } from "@/lib/domain/clients";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Client, SourceDocument } from "@/lib/domain/types";
import { FixtureIntakeModel } from "./fixture-model";
import { MAX_RUNS_PER_HOUR, STALE_RUN_MS, runIntakeAnalysis, type IntakeStore, type NewRun, type RunPatch } from "./intake-runner";
import { ModelError, type IntakeModel } from "./model";

const NOW = Date.parse("2026-10-27T12:00:00.000Z");

/** An in-memory store that behaves like the database: one active run per client. */
class MemoryStore implements IntakeStore {
  runs: AgentRunRecord[] = [];
  proposals: { id: string; runId: string; target: string; value: string; status: string }[] = [];
  events: string[] = [];
  extraRunsThisHour = 0;

  constructor(
    public client: Client | null,
    public sources: SourceDocument[] = [],
  ) {}

  async loadClient(clientId: string) {
    return this.client && this.client.id === clientId ? { client: this.client, sources: this.sources } : null;
  }
  async runsFor(key: string) {
    return this.runs.filter((run) => run.idempotencyKey === key).sort((a, b) => a.attempt - b.attempt);
  }
  async activeRun(clientId: string) {
    return this.runs.find((run) => run.clientId === clientId && (run.status === "running" || run.status === "queued")) ?? null;
  }
  async runsSince() {
    return this.runs.length + this.extraRunsThisHour;
  }
  async insertRun(run: NewRun) {
    if (run.status === "running" && (await this.activeRun(run.clientId))) return null;
    const stamp = new Date(NOW).toISOString();
    const record: AgentRunRecord = {
      id: `run-${this.runs.length + 1}`,
      agentId: "research",
      taskType: "research.intake",
      clientId: run.clientId,
      projectId: null,
      taskId: null,
      idempotencyKey: run.idempotencyKey,
      attempt: run.attempt,
      status: run.status,
      trigger: { kind: "manual", requestedBy: run.requestedBy },
      inputs: run.inputs,
      outputs: [],
      result: null,
      blocker: run.blocker,
      error: null,
      runner: run.runner,
      model: run.model,
      createdAt: stamp,
      startedAt: stamp,
      finishedAt: run.status === "running" ? null : stamp,
    };
    this.runs.push(record);
    return record;
  }
  async finishRun(runId: string, patch: RunPatch) {
    const run = this.runs.find((r) => r.id === runId)!;
    Object.assign(run, { status: patch.status, result: patch.result ?? null, outputs: patch.outputs ?? [], error: patch.error ?? null, finishedAt: new Date(NOW).toISOString() });
    return run;
  }
  async supersedePending(clientId: string) {
    for (const proposal of this.proposals) {
      const run = this.runs.find((r) => r.id === proposal.runId);
      if (run?.clientId === clientId && proposal.status === "pending") proposal.status = "superseded";
    }
  }
  async insertProposals(runId: string, _clientId: string, drafts: { target: string; value: string }[]) {
    return drafts.map((draft) => {
      const id = `proposal-${this.proposals.length + 1}`;
      this.proposals.push({ id, runId, target: draft.target, value: draft.value, status: "pending" });
      return id;
    });
  }
  async recordEvent(_clientId: string, eventType: string) {
    this.events.push(eventType);
  }
}

function makeClient(initialNotes: string | null = "Budget: 40 000 SEK\nDeadline: before summer") {
  return buildNewClient({ name: "Lumen Yoga", sourceType: "email", initialNotes: initialNotes ?? undefined }, testDeps()).client;
}

function source(content: string, id = "s1"): SourceDocument {
  return { id, clientId: "", type: "email", label: "Email", content, receivedAt: "2026-10-26T10:00:00.000Z" };
}

function run(store: MemoryStore, overrides: Partial<Parameters<typeof runIntakeAnalysis>[0]> = {}) {
  return runIntakeAnalysis({
    store,
    model: new FixtureIntakeModel(),
    clientId: store.client?.id ?? "missing",
    requestedBy: "user-1",
    timeoutMs: 5_000,
    now: () => NOW,
    ...overrides,
  });
}

class CountingModel implements IntakeModel {
  readonly runner = "counting";
  readonly model = "counting";
  readonly test = true;
  calls = 0;
  constructor(private readonly behaviour: (input: IntakeInput, signal: AbortSignal) => Promise<unknown>) {}
  analyze(input: IntakeInput, signal: AbortSignal) {
    this.calls++;
    return this.behaviour(input, signal);
  }
}

describe("runIntakeAnalysis", () => {
  it("stores proposals with evidence for review and never changes the brief itself", async () => {
    const client = makeClient();
    const store = new MemoryStore(client);
    const outcome = await run(store);

    expect(outcome.status).toBe(200);
    expect(outcome.body.run).toMatchObject({ status: "needs_approval", attempt: 1, runner: "fixture" });
    expect(store.proposals.map((p) => [p.target, p.value, p.status])).toEqual([
      ["budget", "40 000 SEK", "pending"],
      ["deadline", "before summer", "pending"],
    ]);
    expect(outcome.body.run?.outputs).toEqual([
      { type: "proposal", id: "proposal-1" },
      { type: "proposal", id: "proposal-2" },
    ]);
    expect(outcome.body.run?.result?.externalResearch).toBe(false);
    expect(store.events).toEqual(["agent.run_started", "agent.run_completed"]);
    // The client record the runner was given is untouched.
    expect(client.context.budget.confidence).toBe("unknown");
  });

  it("reuses the earlier run when the material has not changed, and runs again only when forced", async () => {
    const store = new MemoryStore(makeClient());
    const model = new CountingModel((input, signal) => new FixtureIntakeModel().analyze(input, signal));
    const first = await run(store, { model });
    const second = await run(store, { model });

    expect(second.body).toMatchObject({ reused: true, run: { id: first.body.run?.id } });
    expect(model.calls).toBe(1);

    const forced = await run(store, { model, force: true });
    expect(forced.body.run).toMatchObject({ attempt: 2 });
    expect(model.calls).toBe(2);
    // The newer run replaces the earlier proposals that were still waiting.
    expect(store.proposals.filter((p) => p.status === "pending").map((p) => p.runId)).toEqual(["run-2", "run-2"]);
    expect(store.proposals.filter((p) => p.status === "superseded")).toHaveLength(2);
  });

  it("runs again when the material changes", async () => {
    const store = new MemoryStore(makeClient());
    await run(store);
    store.sources = [source("Platform: Wix")];
    const next = await run(store);
    expect(next.body.reused).toBeUndefined();
    expect(next.body.run?.attempt).toBe(1);
    expect(store.runs).toHaveLength(2);
  });

  it("records a failure, and lets the same material be retried when the failure was temporary", async () => {
    const store = new MemoryStore(makeClient("FIXTURE_FAIL"));
    const failed = await run(store);
    expect(failed.body.run).toMatchObject({ status: "failed", error: { retryable: true } });
    expect(store.events).toEqual(["agent.run_started", "agent.run_failed"]);
    expect(store.proposals).toEqual([]);

    const retried = await run(store);
    expect(retried.body.run).toMatchObject({ attempt: 2, status: "failed" });
  });

  it("does not retry a permanent failure unless asked", async () => {
    const store = new MemoryStore(makeClient());
    const model = new CountingModel(async () => {
      throw new ModelError("The model refused.", false);
    });
    await run(store, { model });
    const again = await run(store, { model });
    expect(again.body).toMatchObject({ reused: true, run: { status: "failed", error: { retryable: false } } });
    expect(model.calls).toBe(1);
  });

  it("treats output that breaks the contract as a failed run, not as data", async () => {
    const store = new MemoryStore(makeClient());
    const outcome = await run(store, { model: new CountingModel(async () => ({ proposals: "everything is confirmed" })) });
    expect(outcome.body.run).toMatchObject({ status: "failed", error: { message: expect.stringContaining("expected format") } });
    expect(store.proposals).toEqual([]);
  });

  it("stops a model that takes too long", async () => {
    const store = new MemoryStore(makeClient());
    const slow = new CountingModel(
      (_input, signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new ModelError("The analysis took too long and was stopped.", true)))),
    );
    const outcome = await run(store, { model: slow, timeoutMs: 20 });
    expect(outcome.body.run).toMatchObject({ status: "failed", error: { message: expect.stringContaining("too long") } });
  });

  it("asks for material instead of calling the model when there is nothing to read", async () => {
    const store = new MemoryStore(makeClient(null));
    const model = new CountingModel(async () => ({}));
    const outcome = await run(store, { model });
    expect(outcome.body.run).toMatchObject({ status: "needs_input", blocker: expect.stringContaining("no source material") });
    expect(model.calls).toBe(0);
    expect(store.events).toEqual([]);
  });

  it("returns the analysis already in progress instead of starting a second one", async () => {
    const store = new MemoryStore(makeClient());
    store.sources = [source("Goal: more bookings")];
    await store.insertRun({ clientId: store.client!.id, idempotencyKey: "other", attempt: 1, status: "running", requestedBy: "user-2", inputs: [], runner: "fixture", model: null, blocker: null });
    const model = new CountingModel(async () => ({}));
    const outcome = await run(store, { model });
    expect(outcome).toMatchObject({ status: 202, body: { reused: true, run: { id: "run-1" } } });
    expect(model.calls).toBe(0);
  });

  it("closes an analysis that never finished and starts a new one", async () => {
    const store = new MemoryStore(makeClient());
    await store.insertRun({ clientId: store.client!.id, idempotencyKey: "other", attempt: 1, status: "running", requestedBy: "user-2", inputs: [], runner: "fixture", model: null, blocker: null });
    const outcome = await run(store, { now: () => NOW + STALE_RUN_MS + 1 });
    expect(store.runs[0]).toMatchObject({ status: "failed", error: { message: expect.stringContaining("did not finish") } });
    expect(outcome.body.run).toMatchObject({ id: "run-2", status: "needs_approval" });
  });

  it("enforces the studio's hourly limit", async () => {
    const store = new MemoryStore(makeClient());
    store.extraRunsThisHour = MAX_RUNS_PER_HOUR;
    const outcome = await run(store);
    expect(outcome.status).toBe(429);
    expect(store.runs).toEqual([]);
  });

  it("does not reveal whether a client exists in another studio", async () => {
    const outcome = await run(new MemoryStore(null), { clientId: "someone-elses-client" });
    expect(outcome).toEqual({ status: 404, body: { error: expect.stringContaining("do not have access") } });
  });
});
