/**
 * Drafts a project's website spec from the client's material, once, on
 * request. The Design agent gets the brief, the text sources and the kept
 * PDFs and images, and nothing else: no tools, no database. Its answer is
 * checked (every text needs a source, the spec must be valid) and stored on
 * the run. Nothing changes in the project's spec: a person reviews the
 * draft and decides what to take (the review screen, AI PR 3).
 */
import type { EntityRef } from "@/lib/agents/contract";
import { authorize } from "@/lib/agents/permissions";
import { worstCaseMicros } from "@/lib/agents/pricing";
import { checkSiteDraftInput, normalizeSiteDraft, siteDraftFingerprint, siteDraftIdempotencyKey, type DraftFile, type SiteDraftInput, type SiteDraftResult } from "@/lib/agents/site-draft";
import { SITE_DRAFT_PROMPT_VERSION, siteDraftBytes } from "@/lib/agents/site-draft-prompt";
import type { ProjectType } from "@/lib/domain/types";
import { callWithinBudget } from "./budgeted-call";
import { buildIntakeInput, MAX_ATTEMPTS, MAX_RUNS_PER_HOUR, type IntakeStore, type RunOutcome } from "./intake-runner";
import type { AgentModel } from "./model";

/** A draft still "running" after this long is treated as failed. Drafts write a lot, so they get longer than other runs. */
export const STALE_DRAFT_MS = 7 * 60_000;

export interface SiteDraftStore extends Pick<IntakeStore, "loadClient" | "runsFor" | "activeRun" | "runsSince" | "insertRun" | "finishRun" | "reserveBudget" | "settleBudget" | "recordEvent"> {
  /** The project, read as the requesting person. Null when it does not exist or is not this client's. */
  loadProject(projectId: string): Promise<{ clientId: string; projectType: ProjectType } | null>;
  /** The client's kept PDFs and images, within the limits, and those left out with the reason. */
  loadFiles(clientId: string): Promise<{ files: DraftFile[]; skipped: SiteDraftResult["skippedFiles"] }>;
}

export async function runSiteDraft(options: {
  store: SiteDraftStore;
  model: AgentModel;
  clientId: string;
  projectId: string;
  requestedBy: string;
  force?: boolean;
  timeoutMs: number;
  capMicros: number;
  now?: () => number;
}): Promise<RunOutcome> {
  const { store, model, clientId, projectId, requestedBy, force = false, timeoutMs, capMicros } = options;
  const now = options.now ?? Date.now;

  for (const action of ["read_context", "create_draft"] as const) {
    const permission = authorize("design", action);
    if (!permission.allowed) return { status: 503, body: { error: permission.reason } };
  }
  if (worstCaseMicros(model.model ?? "", 0, model.maxOutputTokens.draft) === null) {
    return { status: 503, body: { error: `The configured model (${model.model ?? "none"}) has no known price, so its cost cannot be capped. An administrator needs to choose a listed model.` } };
  }

  const [loaded, project] = await Promise.all([store.loadClient(clientId), store.loadProject(projectId)]);
  if (!loaded || !project || project.clientId !== clientId) return { status: 404, body: { error: "This project does not exist, or you do not have access to it." } };
  const { files, skipped } = await store.loadFiles(clientId);
  const base = buildIntakeInput(loaded.client, loaded.sources);
  const input: SiteDraftInput = { client: base.client, projectType: project.projectType, brief: base.brief, sources: base.sources, files };

  const active = await store.activeRun(clientId);
  if (active) {
    const startedAt = Date.parse(active.startedAt ?? active.createdAt);
    if (now() - startedAt < STALE_DRAFT_MS) return { status: 202, body: { run: active, reused: true } };
    await store.finishRun(active.id, { status: "failed", error: { message: "The draft did not finish in time.", retryable: true } });
    await store.settleBudget(active.id, null);
  }

  const key = siteDraftIdempotencyKey(projectId, await siteDraftFingerprint(input, SITE_DRAFT_PROMPT_VERSION));
  const attempts = await store.runsFor(key);
  const latest = attempts.at(-1);
  if (latest && !force) {
    const settled = latest.status !== "failed" || !latest.error?.retryable;
    if (settled && latest.status !== "running" && latest.status !== "queued") return { status: 200, body: { run: latest, reused: true } };
  }
  const attempt = (latest?.attempt ?? 0) + 1;
  if (attempt > MAX_ATTEMPTS) return { status: 429, body: { error: "This material has been drafted too many times. Change the material or contact your administrator." } };
  if ((await store.runsSince(new Date(now() - 3_600_000).toISOString())) >= MAX_RUNS_PER_HOUR) {
    return { status: 429, body: { error: "The studio has reached its hourly limit for AI requests. Try again later." } };
  }

  const check = checkSiteDraftInput(input);
  const inputs: EntityRef[] = [
    { type: "client", id: clientId },
    { type: "project", id: projectId },
    ...input.sources.map((s) => ({ type: "source" as const, id: s.id, label: s.label })),
    ...files.map((f) => ({ type: "artifact" as const, id: f.id, label: f.title })),
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
    promptVersion: SITE_DRAFT_PROMPT_VERSION,
    blocker: check.ok ? null : check.blocker,
  });
  if (!run) {
    const winner = await store.activeRun(clientId);
    return winner ? { status: 202, body: { run: winner, reused: true } } : { status: 409, body: { error: "Another draft just started. Reload to see it." } };
  }
  if (!check.ok) return { status: 200, body: { run } };

  const needed = worstCaseMicros(model.model ?? "", siteDraftBytes(input), model.maxOutputTokens.draft)!;
  const call = await callWithinBudget(store, { runId: run.id, neededMicros: needed, capMicros, nowMs: now() }, async () => {
    await store.recordEvent(clientId, "agent.run_started", `Website draft started on ${input.sources.length + input.brief.length} text sources and ${files.length} files`);
    return model.draftSite(input, AbortSignal.timeout(timeoutMs));
  });
  if (call.kind === "refused") {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: call.message, retryable: true } });
    await store.recordEvent(clientId, "agent.run_failed", "Website draft not run: the monthly AI budget is used up");
    return { status: 200, body: { run: finished } };
  }
  if (call.kind === "failed") {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: call.error.message, retryable: call.error.retryable }, spend: call.spend });
    await store.recordEvent(clientId, "agent.run_failed", `Website draft failed: ${call.error.message}`);
    return { status: 200, body: { run: finished } };
  }

  let result: SiteDraftResult;
  try {
    result = { ...normalizeSiteDraft(call.answer.output, input, { runId: run.id, projectId }), skippedFiles: skipped };
  } catch {
    const message = "The model's answer did not make a valid website spec.";
    const finished = await store.finishRun(run.id, { status: "failed", error: { message, retryable: true }, spend: call.spend });
    await store.recordEvent(clientId, "agent.run_failed", `Website draft failed: ${message}`);
    return { status: 200, body: { run: finished } };
  }
  const finished = await store.finishRun(run.id, { status: "needs_approval", result, spend: call.spend });
  await store.recordEvent(clientId, "agent.run_completed", `Website draft ready for review: ${result.spec.pages.length} pages, ${result.dropped.length} unsupported texts left out`);
  return { status: 200, body: { run: finished } };
}
