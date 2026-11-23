/**
 * The warmer-text pass, once, on request. The Design agent gets the saved
 * spec's prose texts and the client's own writing, and nothing else: no
 * tools, no database. Its proposals are checked (no new names, numbers,
 * places or links; no stock phrases) and stored on the run. Nothing in the
 * spec changes: a person ticks the proposals to take in the editor.
 */
import type { EntityRef } from "@/lib/agents/contract";
import { authorize } from "@/lib/agents/permissions";
import { worstCaseMicros } from "@/lib/agents/pricing";
import { checkWarmTextInput, normalizeWarmText, voiceOf, warmTextCandidates, warmTextFingerprint, warmTextIdempotencyKey, type WarmTextInput, type WarmTextResult } from "@/lib/agents/warm-text";
import { WARM_TEXT_PROMPT_VERSION, warmTextBytes } from "@/lib/agents/warm-text-prompt";
import { SITE_LOCALE_LABELS } from "@/lib/site-spec/catalog";
import type { SiteSpecRecord } from "@/lib/domain/types";
import { callWithinBudget } from "./budgeted-call";
import { buildIntakeInput, MAX_ATTEMPTS, MAX_RUNS_PER_HOUR, type RunOutcome } from "./intake-runner";
import type { AgentModel } from "./model";
import type { SiteDraftStore } from "./site-draft-runner";

/** A pass still "running" after this long is treated as failed. */
export const STALE_WARM_TEXT_MS = 5 * 60_000;

export interface WarmTextStore extends Pick<SiteDraftStore, "loadClient" | "runsFor" | "activeRun" | "runsSince" | "insertRun" | "finishRun" | "reserveBudget" | "settleBudget" | "recordEvent"> {
  /** A saved spec version, read as the requesting person. Null when it does not exist or they cannot read it. */
  loadSpec(specId: string): Promise<SiteSpecRecord | null>;
}

export async function runWarmText(options: {
  store: WarmTextStore;
  model: AgentModel;
  clientId: string;
  projectId: string;
  specId: string;
  requestedBy: string;
  force?: boolean;
  timeoutMs: number;
  capMicros: number;
  now?: () => number;
}): Promise<RunOutcome> {
  const { store, model, clientId, projectId, specId, requestedBy, force = false, timeoutMs, capMicros } = options;
  const now = options.now ?? Date.now;

  for (const action of ["read_context", "create_draft"] as const) {
    const permission = authorize("design", action);
    if (!permission.allowed) return { status: 503, body: { error: permission.reason } };
  }
  if (worstCaseMicros(model.model ?? "", 0, model.maxOutputTokens.warm) === null) {
    return { status: 503, body: { error: `The configured model (${model.model ?? "none"}) has no known price, so its cost cannot be capped. An administrator needs to choose a listed model.` } };
  }

  const [loaded, record] = await Promise.all([store.loadClient(clientId), store.loadSpec(specId)]);
  if (!loaded || !record || record.clientId !== clientId || record.projectId !== projectId) {
    return { status: 404, body: { error: "This website spec does not exist, or you do not have access to it." } };
  }
  const spec = record.spec;
  const material = buildIntakeInput(loaded.client, loaded.sources);
  const input: WarmTextInput = {
    client: { name: loaded.client.name },
    industry: spec.strategy.industry ?? null,
    tone: spec.strategy.tone,
    language: SITE_LOCALE_LABELS[spec.locales.default],
    texts: warmTextCandidates(spec),
    voice: voiceOf(material.sources),
  };

  const active = await store.activeRun(clientId);
  if (active) {
    const startedAt = Date.parse(active.startedAt ?? active.createdAt);
    if (now() - startedAt < STALE_WARM_TEXT_MS) {
      if (active.taskType === "design.warm_text") return { status: 202, body: { run: active, reused: true } };
      return { status: 409, body: { error: "The Design agent is still working on this client. Try again when it has finished." } };
    }
    await store.finishRun(active.id, { status: "failed", error: { message: "The run did not finish in time.", retryable: true } });
    await store.settleBudget(active.id, null);
  }

  const key = warmTextIdempotencyKey(specId, await warmTextFingerprint(input, WARM_TEXT_PROMPT_VERSION));
  const attempts = await store.runsFor(key);
  const latest = attempts.at(-1);
  if (latest && !force) {
    const settled = latest.status !== "failed" || !latest.error?.retryable;
    if (settled && latest.status !== "running" && latest.status !== "queued") return { status: 200, body: { run: latest, reused: true } };
  }
  const attempt = (latest?.attempt ?? 0) + 1;
  if (attempt > MAX_ATTEMPTS) return { status: 429, body: { error: "These texts have been through the pass too many times. Change them or contact your administrator." } };
  if ((await store.runsSince(new Date(now() - 3_600_000).toISOString())) >= MAX_RUNS_PER_HOUR) {
    return { status: 429, body: { error: "The studio has reached its hourly limit for AI requests. Try again later." } };
  }

  const check = checkWarmTextInput(input);
  const inputs: EntityRef[] = [
    { type: "client", id: clientId },
    { type: "project", id: projectId },
    { type: "artifact", id: specId, label: `Website spec, version ${record.version}` },
    ...input.voice.map((v) => ({ type: "source" as const, id: v.id, label: v.label })),
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
    promptVersion: WARM_TEXT_PROMPT_VERSION,
    blocker: check.ok ? null : check.blocker,
  });
  if (!run) {
    const winner = await store.activeRun(clientId);
    return winner ? { status: 202, body: { run: winner, reused: true } } : { status: 409, body: { error: "Another run just started. Reload to see it." } };
  }
  if (!check.ok) return { status: 200, body: { run } };

  const needed = worstCaseMicros(model.model ?? "", warmTextBytes(input), model.maxOutputTokens.warm)!;
  const call = await callWithinBudget(store, { runId: run.id, neededMicros: needed, capMicros, nowMs: now() }, async () => {
    await store.recordEvent(clientId, "agent.run_started", `Warmer-text pass started on ${input.texts.length} texts of the website spec, version ${record.version}`);
    return model.warmText(input, AbortSignal.timeout(timeoutMs));
  });
  if (call.kind === "refused") {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: call.message, retryable: true } });
    await store.recordEvent(clientId, "agent.run_failed", "Warmer-text pass not run: the monthly AI budget is used up");
    return { status: 200, body: { run: finished } };
  }
  if (call.kind === "failed") {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: call.error.message, retryable: call.error.retryable }, spend: call.spend });
    await store.recordEvent(clientId, "agent.run_failed", `Warmer-text pass failed: ${call.error.message}`);
    return { status: 200, body: { run: finished } };
  }

  let result: WarmTextResult;
  try {
    result = normalizeWarmText(call.answer.output, input, { id: specId, version: record.version });
  } catch {
    const message = "The model's answer was not in the expected form.";
    const finished = await store.finishRun(run.id, { status: "failed", error: { message, retryable: true }, spend: call.spend });
    await store.recordEvent(clientId, "agent.run_failed", `Warmer-text pass failed: ${message}`);
    return { status: 200, body: { run: finished } };
  }
  const finished = await store.finishRun(run.id, { status: "needs_approval", result, spend: call.spend });
  await store.recordEvent(clientId, "agent.run_completed", `Warmer-text proposals ready for review: ${result.suggestions.length} proposed, ${result.dropped.length} left out by the checks`);
  return { status: 200, body: { run: finished } };
}
