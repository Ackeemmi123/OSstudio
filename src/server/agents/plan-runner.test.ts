import { describe, expect, it } from "vitest";
import { planResultOf } from "@/lib/agents/contract";
import { buildPlanInput, planRequestBytes, type PlanInput } from "@/lib/agents/plan";
import { costMicros, worstCaseMicros } from "@/lib/agents/pricing";
import { AGENTS } from "@/lib/agents/registry";
import { buildNewClient } from "@/lib/domain/clients";
import { testDeps } from "@/lib/domain/test-helpers";
import type { Client, ContextFieldKey } from "@/lib/domain/types";
import { FixtureModel } from "./fixture-model";
import { runIntakeAnalysis } from "./intake-runner";
import { ModelError, type AgentModel, type ModelAnswer } from "./model";
import { runTaskSuggestions } from "./plan-runner";
import { MemoryStore, NOW } from "./testing/memory-store";

const CAP = 25_000_000;
const USAGE = { inputTokens: 900, outputTokens: 400, cacheReadTokens: 0, cacheWriteTokens: 0 };
const PLAN = { id: "coordination", taskType: "coordination.plan" } as const;

function clientWith(values: Partial<Record<ContextFieldKey, string>>): Client {
  const client = buildNewClient({ name: "Lumen Yoga", contactPerson: "Mia Berg", email: "mia@lumen.example", sourceType: "email", initialNotes: "Budget: 40 000 SEK" }, testDeps()).client;
  for (const [key, value] of Object.entries(values)) client.context[key as ContextFieldKey] = { value, confidence: "observed", updatedAt: "2026-10-26T10:00:00.000Z" };
  return client;
}

const BRIEF = { goal: "More class bookings", integrations: "Bokamera booking", existingMaterials: "Brand guidelines from 2024" };

/** A model priced like Claude Opus 5.5 whose task suggestions the test decides. */
class PlanModel implements AgentModel {
  readonly runner = "counting";
  readonly model = "claude-opus-5-5";
  readonly test = true;
  readonly maxOutputTokens = { intake: 16_000, plan: 4_000 };
  calls = 0;
  inputs: PlanInput[] = [];
  constructor(private readonly behaviour: (input: PlanInput, signal: AbortSignal) => Promise<unknown> = (input, signal) => new FixtureModel().suggestTasks(input, signal).then((a) => a.output)) {}
  async analyze(): Promise<ModelAnswer> {
    return { output: null, usage: USAGE, servedBy: this.model };
  }
  async suggestTasks(input: PlanInput, signal: AbortSignal): Promise<ModelAnswer> {
    this.calls++;
    this.inputs.push(input);
    return { output: await this.behaviour(input, signal), usage: USAGE, servedBy: this.model };
  }
}

function suggest(store: MemoryStore, overrides: Partial<Parameters<typeof runTaskSuggestions>[0]> = {}) {
  return runTaskSuggestions({
    store,
    model: new FixtureModel(),
    clientId: store.client?.id ?? "missing",
    projectType: "brand_website",
    requestedBy: "user-1",
    timeoutMs: 5_000,
    capMicros: CAP,
    now: () => NOW,
    ...overrides,
  });
}

const planStore = (client: Client) => new MemoryStore(client, [], PLAN);
const reserveFor = (model: PlanModel, store: MemoryStore) =>
  worstCaseMicros(model.model, planRequestBytes(buildPlanInput(store.client!, "brand_website")), model.maxOutputTokens.plan)!;

describe("runTaskSuggestions", () => {
  it("stores checked suggestions on the run and creates nothing", async () => {
    const store = planStore(clientWith({ ...BRIEF, content: "We need help writing page copy" }));
    const outcome = await suggest(store);

    expect(outcome.status).toBe(200);
    const run = outcome.body.run!;
    expect(run).toMatchObject({ agentId: "coordination", taskType: "coordination.plan", status: "needs_approval", runner: "fixture", outputs: [] });
    expect(planResultOf(run)).toEqual({
      kind: "plan",
      projectType: "brand_website",
      add: [
        { stage: "discovery", title: "Content plan and writing schedule", reason: expect.any(String), basedOn: "content" },
        { stage: "development", title: "Connect the integrations the client named", reason: expect.any(String), basedOn: "integrations" },
      ],
      remove: [{ title: "Brand guidelines", reason: "The client already has brand guidelines." }],
      // The fixture repeats a playbook task, which the checks drop.
      discarded: 1,
      externalResearch: false,
    });
    expect(run.inputs).toContainEqual({ type: "context_field", clientId: store.client!.id, key: "integrations" });
    expect(store.proposals).toEqual([]);
    expect(store.events).toEqual([]);
  });

  it("gives the model the brief and playbook only", async () => {
    const store = planStore(clientWith(BRIEF));
    const model = new PlanModel();
    await suggest(store, { model });
    const sent = JSON.stringify(model.inputs[0]);
    for (const secret of ["Lumen", "Mia", "mia@lumen", "40 000 SEK"]) expect(sent).not.toContain(secret);
    expect(sent).toContain("Bokamera booking");
  });

  it("reuses the answer for the same brief and project type, and asks again when either changes", async () => {
    const store = planStore(clientWith(BRIEF));
    const model = new PlanModel();
    const first = await suggest(store, { model });
    const again = await suggest(store, { model });
    expect(again.body).toMatchObject({ reused: true, run: { id: first.body.run!.id } });
    expect(model.calls).toBe(1);

    await suggest(store, { model, projectType: "website" });
    store.client!.context.deadline = { value: "Before summer", confidence: "observed", updatedAt: "2026-10-26T10:00:00.000Z" };
    await suggest(store, { model });
    expect(model.calls).toBe(3);
  });

  it("asks for a brief before calling the model", async () => {
    const store = planStore(clientWith({}));
    const model = new PlanModel();
    const outcome = await suggest(store, { model });
    expect(outcome.body.run).toMatchObject({ status: "needs_input", blocker: expect.stringContaining("brief is empty") });
    expect(model.calls).toBe(0);
    expect(store.reservations.size).toBe(0);
  });

  it("starts one request when two arrive together", async () => {
    const store = planStore(clientWith(BRIEF));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const model = new PlanModel(async () => {
      await gate;
      return { add: [], remove: [] };
    });
    // Either request may win the race; the other must reuse its run.
    const pending = [suggest(store, { model }), suggest(store, { model })];
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const outcomes = await Promise.all(pending);
    expect(outcomes.map((o) => o.status).sort()).toEqual([200, 202]);
    expect(outcomes.find((o) => o.status === 202)).toMatchObject({ body: { reused: true } });
    expect(outcomes.find((o) => o.status === 200)?.body.run).toMatchObject({ status: "succeeded" });
    expect(model.calls).toBe(1);
  });

  it("records the cost and settles the reservation", async () => {
    const store = planStore(clientWith(BRIEF));
    const model = new PlanModel();
    const outcome = await suggest(store, { model });
    expect(outcome.body.run).toMatchObject({ costMicros: costMicros(USAGE, "claude-opus-5-5"), servedBy: "claude-opus-5-5", promptVersion: expect.stringMatching(/^plan-/) });
    expect(store.spentMicros).toBe(costMicros(USAGE, "claude-opus-5-5"));
    expect(store.reservedMicros).toBe(0);
  });

  it("shares the monthly budget with the intake agent and refuses at the cap", async () => {
    const intake = new MemoryStore(clientWith(BRIEF));
    const store = intake.forAgent(PLAN);
    const model = new PlanModel();
    store.spentMicros = CAP - reserveFor(model, store) + 1;
    const refused = await suggest(store, { model });
    expect(refused.body.run).toMatchObject({ status: "failed", error: { retryable: true, message: expect.stringContaining("almost used up") } });
    expect(model.calls).toBe(0);

    store.spentMicros = CAP;
    const intakeRun = await runIntakeAnalysis({ store: intake, model: new FixtureModel(), clientId: intake.client!.id, requestedBy: "user-1", timeoutMs: 5_000, capMicros: CAP, now: () => NOW });
    expect(intakeRun.body.run).toMatchObject({ status: "failed", error: { message: expect.stringContaining("is used up") } });
  });

  it("fails cleanly on a malformed answer, and still charges for it", async () => {
    const store = planStore(clientWith(BRIEF));
    const model = new PlanModel(async () => ({ add: "not a list" }));
    const outcome = await suggest(store, { model });
    expect(outcome.body.run).toMatchObject({ status: "failed", result: null, error: { retryable: true, message: expect.stringContaining("expected format") } });
    expect(store.spentMicros).toBe(costMicros(USAGE, "claude-opus-5-5"));
  });

  it("charges nothing when the provider refused before working, and everything when the cost is unknown", async () => {
    const store = planStore(clientWith(BRIEF));
    const refused = new PlanModel(async () => {
      throw new ModelError("Busy.", true, "nothing");
    });
    await suggest(store, { model: refused });
    expect(store.spentMicros).toBe(0);

    const slow = new PlanModel((_input, signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new ModelError("Too slow.", true)))));
    const outcome = await suggest(store, { model: slow, timeoutMs: 5 });
    expect(outcome.body.run).toMatchObject({ status: "failed", error: { message: "Too slow." } });
    expect(store.spentMicros).toBe(reserveFor(slow, store));
    expect(store.reservedMicros).toBe(0);
  });

  it("refuses a model without a known price, and a disconnected agent", async () => {
    const store = planStore(clientWith(BRIEF));
    const unpriced = Object.assign(new PlanModel(), { model: "claude-unknown" });
    expect(await suggest(store, { model: unpriced })).toMatchObject({ status: 503 });
    const original = AGENTS.coordination.status;
    AGENTS.coordination.status = "planned";
    try {
      expect(await suggest(store)).toMatchObject({ status: 503 });
    } finally {
      AGENTS.coordination.status = original;
    }
    expect(store.runs).toEqual([]);
  });

  it("does not answer for a client it cannot see", async () => {
    expect(await suggest(planStore(clientWith(BRIEF)), { clientId: "someone-else" })).toMatchObject({ status: 404 });
  });
});
