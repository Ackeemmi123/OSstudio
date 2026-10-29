/**
 * Runs the Client Intake & Research agent once, for one client, on request.
 *
 * The agent has no tools and no database access. This runner reads the
 * client's brief and source material (as the requesting person, so access
 * rules apply), gives the model only that, checks what comes back, and
 * stores the result as proposals for a person to review. Every run is
 * recorded with its inputs, outputs, status and errors.
 */
import { intakeIdempotencyKey, type AgentRunRecord, type EntityRef, type IntakeResult } from "@/lib/agents/contract";
import { checkIntakeInput, intakeFingerprint, normalizeIntakeOutput, type IntakeInput, type IntakeSource, type ProposalDraft } from "@/lib/agents/intake";
import { INTAKE_PROMPT_VERSION } from "@/lib/agents/intake-prompt";
import { authorize } from "@/lib/agents/permissions";
import { costMicros, formatUsd, worstCaseMicros, type TokenUsage } from "@/lib/agents/pricing";
import { currentValueFor } from "@/lib/domain/intake";
import { CONTEXT_FIELD_KEYS, PROPOSAL_TARGETS, type Client, type SourceDocument } from "@/lib/domain/types";
import { ModelError, type IntakeModel } from "./model";

/** A run still "running" after this long is treated as failed. */
export const STALE_RUN_MS = 3 * 60_000;
export const MAX_RUNS_PER_HOUR = 30;
export const MAX_ATTEMPTS = 20;

export interface NewRun {
  clientId: string;
  idempotencyKey: string;
  attempt: number;
  status: "running" | "needs_input";
  requestedBy: string;
  inputs: EntityRef[];
  runner: string;
  model: string | null;
  promptVersion: string;
  blocker: string | null;
}

export interface RunPatch {
  status: AgentRunRecord["status"];
  result?: IntakeResult | null;
  outputs?: EntityRef[];
  error?: { message: string; retryable: boolean } | null;
  /** What the model call used, when one was made and the provider said. */
  spend?: { usage: TokenUsage; servedBy: string | null; costMicros: number };
}

export type BudgetReservation = { ok: true } | { ok: false; spentMicros: number; reservedMicros: number };

/** What the runner needs from storage. Reads run as the requesting person; writes as the runner. */
export interface IntakeStore {
  loadClient(clientId: string): Promise<{ client: Client; sources: SourceDocument[] } | null>;
  runsFor(idempotencyKey: string): Promise<AgentRunRecord[]>;
  activeRun(clientId: string): Promise<AgentRunRecord | null>;
  runsSince(isoTime: string): Promise<number>;
  /** Returns null when another request created an active run first. */
  insertRun(run: NewRun): Promise<AgentRunRecord | null>;
  finishRun(runId: string, patch: RunPatch): Promise<AgentRunRecord>;
  /** Marks earlier, still pending proposals for this client as superseded. */
  supersedePending(clientId: string): Promise<void>;
  insertProposals(runId: string, clientId: string, proposals: ProposalDraft[]): Promise<string[]>;
  recordEvent(clientId: string, eventType: "agent.run_started" | "agent.run_completed" | "agent.run_failed", description: string): Promise<void>;
  /** Holds `amountMicros` of this month's AI budget for a running run, unless that would pass `capMicros`. */
  reserveBudget(runId: string, amountMicros: number, capMicros: number): Promise<BudgetReservation>;
  /** Settles a run's reservation at what it cost; null charges the whole reservation. Settling twice changes nothing. */
  settleBudget(runId: string, chargedMicros: number | null): Promise<void>;
}

export type RunOutcome = { status: number; body: { run?: AgentRunRecord; reused?: boolean; error?: string } };

export async function runIntakeAnalysis(options: {
  store: IntakeStore;
  model: IntakeModel;
  clientId: string;
  requestedBy: string;
  force?: boolean;
  timeoutMs: number;
  /** The monthly AI budget across all agents, in micro-dollars. */
  capMicros: number;
  now?: () => number;
}): Promise<RunOutcome> {
  const { store, model, clientId, requestedBy, force = false, timeoutMs, capMicros } = options;
  const now = options.now ?? Date.now;

  for (const action of ["read_context", "propose_context"] as const) {
    const permission = authorize("research", action);
    if (!permission.allowed) return { status: 503, body: { error: permission.reason } };
  }
  // A model without a known price could not be kept within the budget.
  if (worstCaseMicros(model.model ?? "", 0, model.maxOutputTokens) === null) {
    return { status: 503, body: { error: `The configured model (${model.model ?? "none"}) has no known price, so its cost cannot be capped. An administrator needs to choose a listed model.` } };
  }

  const loaded = await store.loadClient(clientId);
  if (!loaded) return { status: 404, body: { error: "This client does not exist, or you do not have access to it." } };
  const input = buildIntakeInput(loaded.client, loaded.sources);

  // One active run per client. A run that never finished is closed first.
  const active = await store.activeRun(clientId);
  if (active) {
    const startedAt = Date.parse(active.startedAt ?? active.createdAt);
    if (now() - startedAt < STALE_RUN_MS) return { status: 202, body: { run: active, reused: true } };
    await store.finishRun(active.id, { status: "failed", error: { message: "The analysis did not finish in time.", retryable: true } });
    // Its call may have been billed, so the whole reservation counts.
    await store.settleBudget(active.id, null);
  }

  const key = intakeIdempotencyKey(clientId, await intakeFingerprint(input));
  const attempts = await store.runsFor(key);
  const latest = attempts.at(-1);
  if (latest && !force) {
    const settled = latest.status !== "failed" || !latest.error?.retryable;
    if (settled && latest.status !== "running" && latest.status !== "queued") return { status: 200, body: { run: latest, reused: true } };
  }
  const attempt = (latest?.attempt ?? 0) + 1;
  if (attempt > MAX_ATTEMPTS) return { status: 429, body: { error: "This material has been analyzed too many times. Change the material or contact your administrator." } };
  if ((await store.runsSince(new Date(now() - 3_600_000).toISOString())) >= MAX_RUNS_PER_HOUR) {
    return { status: 429, body: { error: "The studio has reached its hourly limit for analyses. Try again later." } };
  }

  const check = checkIntakeInput(input);
  const inputs: EntityRef[] = [{ type: "client", id: clientId }, ...input.sources.map((s) => ({ type: "source" as const, id: s.id, label: s.label }))];
  const run = await store.insertRun({
    clientId,
    idempotencyKey: key,
    attempt,
    status: check.ok ? "running" : "needs_input",
    requestedBy,
    inputs,
    runner: model.runner,
    model: model.model,
    promptVersion: INTAKE_PROMPT_VERSION,
    blocker: check.ok ? null : check.blocker,
  });
  if (!run) {
    const winner = await store.activeRun(clientId);
    return winner ? { status: 202, body: { run: winner, reused: true } } : { status: 409, body: { error: "Another analysis just started. Reload to see it." } };
  }
  if (!check.ok) return { status: 200, body: { run } };

  const characters = input.sources.reduce((sum, source) => sum + source.content.length, 0);
  const needed = worstCaseMicros(model.model ?? "", characters, model.maxOutputTokens)!;
  const reservation = await store.reserveBudget(run.id, needed, capMicros);
  if (!reservation.ok) {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: budgetMessage(reservation, capMicros, needed, now()), retryable: true } });
    await store.recordEvent(clientId, "agent.run_failed", "Intake analysis not run: the monthly AI budget is used up");
    return { status: 200, body: { run: finished } };
  }

  await store.recordEvent(clientId, "agent.run_started", `Intake analysis started on ${plural(input.sources.length, "source")}`);

  let spend: RunPatch["spend"];
  try {
    const answer = await model.analyze(input, AbortSignal.timeout(timeoutMs));
    spend = { usage: answer.usage, servedBy: answer.servedBy, costMicros: costMicros(answer.usage, answer.servedBy) };
    await store.settleBudget(run.id, spend.costMicros);
    let normalized;
    try {
      normalized = normalizeIntakeOutput(answer.output, input);
    } catch {
      throw new ModelError("The model's answer did not match the expected format.", true);
    }
    await store.supersedePending(clientId);
    const ids = await store.insertProposals(run.id, clientId, normalized.proposals);
    const needsReview = ids.length > 0 || normalized.result.questions.length > 0;
    const finished = await store.finishRun(run.id, {
      status: needsReview ? "needs_approval" : "succeeded",
      result: normalized.result,
      outputs: ids.map((id) => ({ type: "proposal" as const, id })),
      spend,
    });
    await store.recordEvent(
      clientId,
      "agent.run_completed",
      ids.length ? `Intake analysis proposed ${plural(ids.length, "value")} for review` : "Intake analysis found no new values",
    );
    return { status: 200, body: { run: finished } };
  } catch (error) {
    const failure = error instanceof ModelError ? error : new ModelError("The analysis failed unexpectedly.", true);
    if (!spend) {
      // The call failed. Charge what the provider reported, nothing when it
      // refused before doing any work, and the whole reservation when unknown.
      if (failure.spent === "nothing") await store.settleBudget(run.id, 0);
      else if (failure.spent) {
        spend = { ...failure.spent, costMicros: costMicros(failure.spent.usage, failure.spent.servedBy) };
        await store.settleBudget(run.id, spend.costMicros);
      } else await store.settleBudget(run.id, null);
    }
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: failure.message, retryable: failure.retryable }, spend });
    await store.recordEvent(clientId, "agent.run_failed", `Intake analysis failed: ${failure.message}`);
    return { status: 200, body: { run: finished } };
  }
}

/** The client's first-contact notes count as a source alongside material added later. */
export function initialNotesSourceId(clientId: string) {
  return `initial-notes-${clientId}`;
}

export function buildIntakeInput(client: Client, sources: SourceDocument[]): IntakeInput {
  const material: IntakeSource[] = [];
  if (client.source.initialNotes?.trim()) {
    material.push({ id: initialNotesSourceId(client.id), label: "First contact notes", type: client.source.type, content: client.source.initialNotes });
  }
  for (const source of [...sources].sort((a, b) => a.receivedAt.localeCompare(b.receivedAt))) {
    material.push({ id: source.id, label: source.label, type: source.type, content: source.content });
  }
  const brief = PROPOSAL_TARGETS.flatMap((target) => {
    const value = currentValueFor(client, target);
    // The name is sent above; a recorded email address is not needed to analyze anything.
    if (!value || target === "companyName" || target === "email") return [];
    const confidence = (CONTEXT_FIELD_KEYS as readonly string[]).includes(target)
      ? client.context[target as (typeof CONTEXT_FIELD_KEYS)[number]].confidence
      : "observed";
    return [{ target, value, confidence }];
  });
  return {
    client: { name: client.name, contactPerson: client.contactPerson, website: client.website },
    brief,
    sources: material,
  };
}

function budgetMessage(reservation: { spentMicros: number; reservedMicros: number }, capMicros: number, neededMicros: number, nowMs: number) {
  const today = new Date(nowMs);
  const resets = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1)).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const cap = formatUsd(capMicros);
  const spent = formatUsd(reservation.spentMicros);
  const after = `Analyses can run again from ${resets}, or sooner if an administrator raises the limit.`;
  if (reservation.spentMicros >= capMicros) return `This month's AI budget of ${cap} is used up (${spent} spent). ${after}`;
  if (reservation.reservedMicros > 0) {
    return `This month's AI budget of ${cap} has no room for another analysis while others are running (${spent} spent, ${formatUsd(reservation.reservedMicros)} held for analyses in progress). Try again in a few minutes.`;
  }
  return `This month's AI budget of ${cap} is almost used up (${spent} spent), and one analysis can cost up to ${formatUsd(neededMicros)}. ${after}`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
