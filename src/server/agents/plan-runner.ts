/**
 * Runs the Project Coordination agent once, on request, to suggest how a new
 * project's starting tasks should differ from the playbook.
 *
 * The agent is given only the brief values and the playbook: no source
 * material, no names or contact details. Its answer is checked and stored on
 * the run. Nothing is created: the suggestions are offered, unticked, in the
 * start-project form, and only the tasks a person ticks become tasks.
 */
import type { EntityRef } from "@/lib/agents/contract";
import { authorize } from "@/lib/agents/permissions";
import { buildPlanInput, checkPlanInput, normalizePlanOutput, planFingerprint, planIdempotencyKey, planRequestBytes } from "@/lib/agents/plan";
import { PLAN_PROMPT_VERSION } from "@/lib/agents/plan-prompt";
import { worstCaseMicros } from "@/lib/agents/pricing";
import type { ProjectType } from "@/lib/domain/types";
import { callWithinBudget } from "./budgeted-call";
import { MAX_ATTEMPTS, MAX_RUNS_PER_HOUR, STALE_RUN_MS, type IntakeStore, type RunOutcome } from "./intake-runner";
import type { AgentModel } from "./model";

export type PlanStore = Pick<IntakeStore, "loadClient" | "runsFor" | "activeRun" | "runsSince" | "insertRun" | "finishRun" | "reserveBudget" | "settleBudget">;

export async function runTaskSuggestions(options: {
  store: PlanStore;
  model: AgentModel;
  clientId: string;
  projectType: ProjectType;
  requestedBy: string;
  timeoutMs: number;
  /** The monthly AI budget across all agents, in micro-dollars. */
  capMicros: number;
  now?: () => number;
}): Promise<RunOutcome> {
  const { store, model, clientId, projectType, requestedBy, timeoutMs, capMicros } = options;
  const now = options.now ?? Date.now;

  for (const action of ["read_context", "propose_context"] as const) {
    const permission = authorize("coordination", action);
    if (!permission.allowed) return { status: 503, body: { error: permission.reason } };
  }
  if (worstCaseMicros(model.model ?? "", 0, model.maxOutputTokens.plan) === null) {
    return { status: 503, body: { error: `The configured model (${model.model ?? "none"}) has no known price, so its cost cannot be capped. An administrator needs to choose a listed model.` } };
  }

  const loaded = await store.loadClient(clientId);
  if (!loaded) return { status: 404, body: { error: "This client does not exist, or you do not have access to it." } };
  const { client } = loaded;
  const input = buildPlanInput(client, projectType);

  const active = await store.activeRun(clientId);
  if (active) {
    const startedAt = Date.parse(active.startedAt ?? active.createdAt);
    if (now() - startedAt < STALE_RUN_MS) return { status: 202, body: { run: active, reused: true } };
    await store.finishRun(active.id, { status: "failed", error: { message: "The suggestions did not finish in time.", retryable: true } });
    await store.settleBudget(active.id, null);
  }

  const key = planIdempotencyKey(clientId, await planFingerprint(input));
  const attempts = await store.runsFor(key);
  const latest = attempts.at(-1);
  if (latest && (latest.status !== "failed" || !latest.error?.retryable) && latest.status !== "running" && latest.status !== "queued") {
    return { status: 200, body: { run: latest, reused: true } };
  }
  const attempt = (latest?.attempt ?? 0) + 1;
  if (attempt > MAX_ATTEMPTS) return { status: 429, body: { error: "Suggestions for this brief have been asked for too many times. Change the brief or contact your administrator." } };
  if ((await store.runsSince(new Date(now() - 3_600_000).toISOString())) >= MAX_RUNS_PER_HOUR) {
    return { status: 429, body: { error: "The studio has reached its hourly limit for AI requests. Try again later." } };
  }

  const check = checkPlanInput(input);
  const inputs: EntityRef[] = [
    { type: "client", id: clientId },
    ...input.brief.map((entry) => ({ type: "context_field" as const, clientId, key: entry.target })),
  ];
  const run = await store.insertRun({
    clientId,
    idempotencyKey: key,
    attempt,
    status: check.ok ? "running" : "needs_input",
    requestedBy,
    inputs,
    runner: model.runner,
    model: model.model,
    promptVersion: PLAN_PROMPT_VERSION,
    blocker: check.ok ? null : check.blocker,
  });
  if (!run) {
    const winner = await store.activeRun(clientId);
    return winner ? { status: 202, body: { run: winner, reused: true } } : { status: 409, body: { error: "Suggestions were just requested. Try again in a moment." } };
  }
  if (!check.ok) return { status: 200, body: { run } };

  const needed = worstCaseMicros(model.model ?? "", planRequestBytes(input), model.maxOutputTokens.plan)!;
  const call = await callWithinBudget(store, { runId: run.id, neededMicros: needed, capMicros, nowMs: now() }, () =>
    model.suggestTasks(input, AbortSignal.timeout(timeoutMs)),
  );
  if (call.kind === "refused") {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: call.message, retryable: true } });
    return { status: 200, body: { run: finished } };
  }
  if (call.kind === "failed") {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: call.error.message, retryable: call.error.retryable }, spend: call.spend });
    return { status: 200, body: { run: finished } };
  }

  let result;
  try {
    result = normalizePlanOutput(call.answer.output, input, [client.name, client.contactPerson]);
  } catch {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: "The model's answer did not match the expected format.", retryable: true }, spend: call.spend });
    return { status: 200, body: { run: finished } };
  }
  const finished = await store.finishRun(run.id, {
    status: result.add.length || result.remove.length ? "needs_approval" : "succeeded",
    result,
    spend: call.spend,
  });
  return { status: 200, body: { run: finished } };
}
