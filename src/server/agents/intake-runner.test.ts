import { describe, expect, it } from "vitest";
import type { AgentRunRecord } from "@/lib/agents/contract";
import type { IntakeInput } from "@/lib/agents/intake";
import { buildNewClient } from "@/lib/domain/clients";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Client, SourceDocument } from "@/lib/domain/types";
import { FixtureIntakeModel } from "./fixture-model";
import { INTAKE_PROMPT_VERSION } from "@/lib/agents/intake-prompt";
import { costMicros, worstCaseMicros } from "@/lib/agents/pricing";
import { buildIntakeMessage, INTAKE_SYSTEM_PROMPT, intakeRequestBytes } from "@/lib/agents/intake-prompt";
import { buildIntakeInput, MAX_RUNS_PER_HOUR, STALE_RUN_MS, runIntakeAnalysis, type IntakeStore, type NewRun, type RunPatch } from "./intake-runner";
import { ModelError, type IntakeModel, type ModelAnswer, type Spent } from "./model";

const NOW = Date.parse("2026-10-27T12:00:00.000Z");

/** An in-memory store that behaves like the database: one active run per client. */
class MemoryStore implements IntakeStore {
  runs: AgentRunRecord[] = [];
  proposals: { id: string; runId: string; target: string; value: string; status: string }[] = [];
  events: string[] = [];
  extraRunsThisHour = 0;
  /** The month's ledger, with the same rules as public.ai_budget_reserve and ai_budget_settle. */
  spentMicros = 0;
  reservedMicros = 0;
  reservations = new Map<string, { reserved: number; charged: number | null }>();

  constructor(
    public client: Client | null,
    public sources: SourceDocument[] = [],
  ) {}

  /** More clients in the same studio, without sources. */
  otherClients: Client[] = [];

  async loadClient(clientId: string) {
    if (this.client && this.client.id === clientId) return { client: this.client, sources: this.sources };
    const other = this.otherClients.find((client) => client.id === clientId);
    return other ? { client: other, sources: [] } : null;
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
      promptVersion: run.promptVersion,
      servedBy: null,
      usage: null,
      costMicros: null,
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
    if (patch.spend) Object.assign(run, { usage: patch.spend.usage, servedBy: patch.spend.servedBy, costMicros: patch.spend.costMicros });
    return run;
  }
  async reserveBudget(runId: string, amount: number, cap: number) {
    if (this.runs.find((r) => r.id === runId)?.status !== "running") throw new Error("Only a running agent run can reserve budget.");
    if (this.reservations.has(runId)) return { ok: true as const };
    if (this.spentMicros + this.reservedMicros >= cap || this.spentMicros + this.reservedMicros + amount > cap) {
      return { ok: false as const, spentMicros: this.spentMicros, reservedMicros: this.reservedMicros };
    }
    this.reservations.set(runId, { reserved: amount, charged: null });
    this.reservedMicros += amount;
    return { ok: true as const };
  }
  async settleBudget(runId: string, charged: number | null) {
    const reservation = this.reservations.get(runId);
    if (!reservation || reservation.charged !== null) return;
    reservation.charged = charged ?? reservation.reserved;
    this.reservedMicros -= reservation.reserved;
    this.spentMicros += reservation.charged;
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
    capMicros: 25_000_000,
    now: () => NOW,
    ...overrides,
  });
}

const USAGE = { inputTokens: 3_000, outputTokens: 4_000, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** A model priced like Claude Opus 5.5 whose answers the test decides. */
class CountingModel implements IntakeModel {
  readonly runner = "counting";
  readonly model = "claude-opus-5-5";
  readonly test = true;
  readonly maxOutputTokens = 16_000;
  calls = 0;
  constructor(
    private readonly behaviour: (input: IntakeInput, signal: AbortSignal) => Promise<unknown>,
    private readonly spent: Spent = { usage: USAGE, servedBy: "claude-opus-5-5" },
  ) {}
  async analyze(input: IntakeInput, signal: AbortSignal): Promise<ModelAnswer> {
    this.calls++;
    return { output: await this.behaviour(input, signal), ...this.spent };
  }
}

/** Waits for a condition instead of a fixed delay, which is too short on a busy machine. */
async function until(condition: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for the test condition.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const answer = (input: IntakeInput, signal: AbortSignal) => new FixtureIntakeModel().analyze(input, signal).then((a) => a.output);

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
    const model = new CountingModel(answer);
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
    await store.insertRun({ clientId: store.client!.id, idempotencyKey: "other", attempt: 1, status: "running", requestedBy: "user-2", inputs: [], runner: "fixture", model: null, promptVersion: INTAKE_PROMPT_VERSION, blocker: null });
    const model = new CountingModel(async () => ({}));
    const outcome = await run(store, { model });
    expect(outcome).toMatchObject({ status: 202, body: { reused: true, run: { id: "run-1" } } });
    expect(model.calls).toBe(0);
  });

  it("closes an analysis that never finished and starts a new one", async () => {
    const store = new MemoryStore(makeClient());
    await store.insertRun({ clientId: store.client!.id, idempotencyKey: "other", attempt: 1, status: "running", requestedBy: "user-2", inputs: [], runner: "fixture", model: null, promptVersion: INTAKE_PROMPT_VERSION, blocker: null });
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

describe("the monthly AI budget", () => {
  const CAP = 25_000_000;
  const reserveFor = (store: MemoryStore) => worstCaseMicros("claude-opus-5-5", intakeRequestBytes(buildIntakeInput(store.client!, store.sources)), 16_000)!;

  it("reserves for everything the call sends, counted in bytes so no script or emoji is under-counted", async () => {
    const notes = "予算は四万クローナ、締め切りは夏前です。🌿".repeat(400);
    const store = new MemoryStore(makeClient(notes), [source("Brief: " + "ありがとう".repeat(500))]);
    store.client!.name = "Ω".repeat(2_000);
    const input = buildIntakeInput(store.client!, store.sources);
    const encoder = new TextEncoder();
    const bytes = intakeRequestBytes(input);
    // Instructions, the whole message (brief and client fields included) and the answer format.
    expect(bytes).toBeGreaterThan(encoder.encode(INTAKE_SYSTEM_PROMPT).length + encoder.encode(buildIntakeMessage(input)).length);
    // Counting source characters alone, as before, reserved far less.
    const sourceCharacters = input.sources.reduce((sum, s) => sum + s.content.length, 0);
    expect(bytes).toBeGreaterThan(2.5 * sourceCharacters);

    const model = new CountingModel(answer);
    await run(store, { model });
    expect(model.calls).toBe(1);
    expect(store.reservations.get(store.runs[0].id)?.reserved).toBe(worstCaseMicros("claude-opus-5-5", bytes, 16_000));
  });

  it("charges every attempt after a fallback, the declined one included, each at its own model's price", async () => {
    const declined = { inputTokens: 5_000, outputTokens: 1_200, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const served = { inputTokens: 5_000, outputTokens: 3_000, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const spent: Spent = {
      usage: { inputTokens: 10_000, outputTokens: 4_200, cacheReadTokens: 0, cacheWriteTokens: 0 },
      servedBy: "claude-opus-4-8",
      attempts: [
        { usage: declined, model: "claude-opus-5-5" },
        { usage: served, model: "claude-opus-4-8" },
      ],
    };
    const expected = costMicros(declined, "claude-opus-5-5") + costMicros(served, "claude-opus-4-8");
    // Pricing only the answer, as before, would have missed the declined attempt.
    expect(expected).toBeGreaterThan(costMicros(served, "claude-opus-4-8"));

    const store = new MemoryStore(makeClient());
    const outcome = await run(store, { model: new CountingModel(answer, spent) });
    expect(outcome.body.run).toMatchObject({ status: "needs_approval", servedBy: "claude-opus-4-8", costMicros: expected, usage: spent.usage });
    expect(store.spentMicros).toBe(expected);

    const refused = new MemoryStore(makeClient());
    await run(refused, { model: new CountingModel(async () => { throw new ModelError("The model declined.", false, spent); }) });
    expect(refused.spentMicros).toBe(expected);
  });

  it("records tokens, the model that answered, the cost and the prompt version, and charges what the call cost", async () => {
    const store = new MemoryStore(makeClient());
    const outcome = await run(store, { model: new CountingModel(answer) });
    const cost = costMicros(USAGE, "claude-opus-5-5");
    expect(cost).toBe(3_000 * 4 + 4_000 * 20);
    expect(outcome.body.run).toMatchObject({ status: "needs_approval", promptVersion: INTAKE_PROMPT_VERSION, servedBy: "claude-opus-5-5", usage: USAGE, costMicros: cost });
    expect(store.spentMicros).toBe(cost);
    expect(store.reservedMicros).toBe(0);
  });

  it("refuses to call the model once the month is at the cap, even for a call that costs nothing", async () => {
    const store = new MemoryStore(makeClient());
    store.spentMicros = CAP;
    const fixture = await run(store);
    expect(fixture.body.run).toMatchObject({ status: "failed", error: { retryable: true, message: expect.stringContaining("is used up ($25.00 spent)") } });
    expect(fixture.body.run?.error?.message).toContain("from 1 November");
    expect(store.events).toEqual(["agent.run_failed"]);
    expect(store.proposals).toEqual([]);

    const model = new CountingModel(answer);
    await run(store, { model, force: true });
    expect(model.calls).toBe(0);
    expect(store.spentMicros).toBe(CAP);
  });

  it("refuses a call whose worst case would pass the cap, and runs it when there is room", async () => {
    const store = new MemoryStore(makeClient());
    const model = new CountingModel(answer);
    store.spentMicros = CAP - reserveFor(store) + 1;
    const refused = await run(store, { model });
    expect(refused.body.run).toMatchObject({ status: "failed", error: { message: expect.stringContaining("almost used up") } });
    expect(model.calls).toBe(0);

    store.spentMicros = CAP - reserveFor(store);
    const allowed = await run(store, { model });
    expect(allowed.body.run).toMatchObject({ status: "needs_approval" });
    expect(model.calls).toBe(1);
    // Settled at the real cost, well under the reservation.
    expect(store.spentMicros).toBe(CAP - reserveFor(store) + costMicros(USAGE, "claude-opus-5-5"));
  });

  it("lets only as many concurrent analyses start as the budget can cover", async () => {
    const store = new MemoryStore(makeClient());
    store.otherClients = [{ ...makeClient(), id: "client-2" }, { ...makeClient(), id: "client-3" }];
    const ids = [store.client!.id, ...store.otherClients.map((client) => client.id)];
    // Room for one worst case, not two.
    store.spentMicros = CAP - 2 * reserveFor(store) + 1;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const model = new CountingModel(async (input, signal) => {
      await gate;
      return answer(input, signal);
    });
    const pending = ids.map((clientId) => run(store, { model, clientId }));
    await until(() => model.calls === 1);
    // Exactly one reservation is open, whichever client won.
    const each = [store.client!, ...store.otherClients].map((client) => worstCaseMicros("claude-opus-5-5", intakeRequestBytes(buildIntakeInput(client, [])), 16_000));
    expect(each).toContain(store.reservedMicros);
    release();
    const outcomes = await Promise.all(pending);
    const statuses = outcomes.map((o) => o.body.run?.status).sort();
    expect(statuses).toEqual(["failed", "failed", "needs_approval"]);
    expect(outcomes.find((o) => o.body.run?.status === "failed")?.body.run?.error?.message).toContain("while others are running");
    expect(model.calls).toBe(1);
    expect(store.reservedMicros).toBe(0);
  });

  it("charges nothing when the provider refused the request before doing any work", async () => {
    const store = new MemoryStore(makeClient());
    await run(store, { model: new CountingModel(async () => { throw new ModelError("The AI provider is busy.", true, "nothing"); }) });
    expect(store.spentMicros).toBe(0);
    expect(store.reservedMicros).toBe(0);
  });

  it("charges the whole reservation when it cannot know what a failed call cost", async () => {
    const store = new MemoryStore(makeClient());
    const slow = new CountingModel((_input, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new ModelError("The analysis took too long and was stopped.", true)))));
    await run(store, { model: slow, timeoutMs: 20 });
    expect(store.spentMicros).toBe(reserveFor(store));
    expect(store.reservedMicros).toBe(0);
  });

  it("charges a refusal or a malformed answer at what the provider reported", async () => {
    const refusing = new MemoryStore(makeClient());
    await run(refusing, { model: new CountingModel(async () => { throw new ModelError("The model declined.", false, { usage: USAGE, servedBy: "claude-opus-5-5" }); }) });
    expect(refusing.spentMicros).toBe(costMicros(USAGE, "claude-opus-5-5"));
    expect(refusing.runs[0]).toMatchObject({ status: "failed", costMicros: costMicros(USAGE, "claude-opus-5-5") });

    const malformed = new MemoryStore(makeClient("FIXTURE_MALFORMED"));
    const outcome = await run(malformed);
    expect(outcome.body.run).toMatchObject({ status: "failed", error: { message: expect.stringContaining("expected format") }, usage: { outputTokens: 600 } });
    expect(malformed.proposals).toEqual([]);
  });

  it("charges an abandoned analysis in full when it closes it", async () => {
    const store = new MemoryStore(makeClient());
    const model = new CountingModel(() => new Promise(() => {}));
    void run(store, { model, timeoutMs: 60_000 });
    await until(() => model.calls === 1);
    expect(store.reservedMicros).toBe(reserveFor(store));
    await run(store, { now: () => NOW + STALE_RUN_MS + 1 });
    expect(store.runs[0]).toMatchObject({ status: "failed" });
    expect(store.spentMicros).toBe(reserveFor(store));
    expect(store.reservedMicros).toBe(0);
  });

  it("will not run a model it has no price for", async () => {
    const store = new MemoryStore(makeClient());
    const unpriced = Object.assign(new CountingModel(answer), { model: "claude-unknown-9" });
    const outcome = await run(store, { model: unpriced });
    expect(outcome).toEqual({ status: 503, body: { error: expect.stringContaining("no known price") } });
    expect(store.runs).toEqual([]);
    expect(unpriced.calls).toBe(0);
  });
});

describe("what the model is sent", () => {
  it("leaves out the contact's email address, which the analysis does not need", () => {
    const client = { ...makeClient(), email: "anna.private@example.com", contactPerson: "Anna" };
    const message = buildIntakeMessage(buildIntakeInput(client, []));
    expect(message).toContain("Contact person: Anna");
    expect(message).not.toContain("anna.private@example.com");
  });
});
