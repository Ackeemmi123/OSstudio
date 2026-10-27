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
import { authorize } from "@/lib/agents/permissions";
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
  blocker: string | null;
}

export interface RunPatch {
  status: AgentRunRecord["status"];
  result?: IntakeResult | null;
  outputs?: EntityRef[];
  error?: { message: string; retryable: boolean } | null;
}

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
}

export type RunOutcome = { status: number; body: { run?: AgentRunRecord; reused?: boolean; error?: string } };

export async function runIntakeAnalysis(options: {
  store: IntakeStore;
  model: IntakeModel;
  clientId: string;
  requestedBy: string;
  force?: boolean;
  timeoutMs: number;
  now?: () => number;
}): Promise<RunOutcome> {
  const { store, model, clientId, requestedBy, force = false, timeoutMs } = options;
  const now = options.now ?? Date.now;

  for (const action of ["read_context", "propose_context"] as const) {
    const permission = authorize("research", action);
    if (!permission.allowed) return { status: 503, body: { error: permission.reason } };
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
    blocker: check.ok ? null : check.blocker,
  });
  if (!run) {
    const winner = await store.activeRun(clientId);
    return winner ? { status: 202, body: { run: winner, reused: true } } : { status: 409, body: { error: "Another analysis just started. Reload to see it." } };
  }
  if (!check.ok) return { status: 200, body: { run } };

  await store.recordEvent(clientId, "agent.run_started", `Intake analysis started on ${plural(input.sources.length, "source")}`);

  try {
    const raw = await model.analyze(input, AbortSignal.timeout(timeoutMs));
    let normalized;
    try {
      normalized = normalizeIntakeOutput(raw, input);
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
    });
    await store.recordEvent(
      clientId,
      "agent.run_completed",
      ids.length ? `Intake analysis proposed ${plural(ids.length, "value")} for review` : "Intake analysis found no new values",
    );
    return { status: 200, body: { run: finished } };
  } catch (error) {
    const failure = error instanceof ModelError ? error : new ModelError("The analysis failed unexpectedly.", true);
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: failure.message, retryable: failure.retryable } });
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
    if (!value || target === "companyName") return [];
    const confidence = (CONTEXT_FIELD_KEYS as readonly string[]).includes(target)
      ? client.context[target as (typeof CONTEXT_FIELD_KEYS)[number]].confidence
      : "observed";
    return [{ target, value, confidence }];
  });
  return {
    client: { name: client.name, contactPerson: client.contactPerson, email: client.email, website: client.website },
    brief,
    sources: material,
  };
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
