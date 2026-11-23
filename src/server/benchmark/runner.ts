/**
 * Compares a project's site with up to three competitors' sites, on request.
 * Each home page is read the same way (analyzePage), and Google's speed test
 * runs on the public ones. The client's site is its published address when it
 * has one; otherwise the newest review link, which is read but never sent to
 * Google. The result is stored as a qa.benchmark run. No AI is used and
 * nothing is changed.
 */
import { randomUUID } from "node:crypto";
import type { EntityRef } from "@/lib/agents/contract";
import { authorize } from "@/lib/agents/permissions";
import { analyzePage } from "@/lib/benchmark/analyze";
import { compareSites, hostOf, type MeasuredSite, type SpeedFacts } from "@/lib/benchmark/compare";
import { BENCHMARK_VERSION, MAX_COMPETITORS, type BenchmarkResult } from "@/lib/benchmark/result";
import { MAX_RUNS_PER_HOUR, type IntakeStore, type RunOutcome } from "@/server/agents/intake-runner";

export interface BenchmarkStore extends Pick<IntakeStore, "loadClient" | "activeRun" | "runsSince" | "insertRun" | "finishRun" | "recordEvent"> {
  loadProject(projectId: string): Promise<{ clientId: string } | null>;
  /** The client's site: its live address, or else the newest open review link (a path on this server). */
  ourSite(projectId: string): Promise<{ url: string; published: boolean } | null>;
}

export interface BenchmarkTools {
  /** Reads a public page; throws an Error whose message a person can read. */
  fetchPage(url: string): Promise<{ url: string; html: string }>;
  measureSpeed(url: string): Promise<{ speed: SpeedFacts | null; note: string | null }>;
  /** Checks and normalises an address a person typed; throws with a readable message. */
  checkUrl(url: string): string;
}

/** A comparison still "running" after this long is treated as failed. */
export const STALE_BENCHMARK_MS = 4 * 60_000;

async function measure(kind: MeasuredSite["kind"], url: string, tools: BenchmarkTools, sendToGoogle: boolean, why: string | null): Promise<MeasuredSite> {
  const [page, speed] = await Promise.all([
    tools.fetchPage(url).then(
      (read) => ({ facts: analyzePage(read.html, read.url), error: null }),
      (error: unknown) => ({ facts: null, error: error instanceof Error ? error.message : "The page could not be read." }),
    ),
    sendToGoogle ? tools.measureSpeed(url).catch(() => ({ speed: null, note: "Google's speed test failed." })) : Promise.resolve({ speed: null, note: why }),
  ]);
  return { kind, url, page: page.facts, error: page.error, speed: speed.speed, speedNote: speed.note };
}

export async function runBenchmark(options: {
  store: BenchmarkStore;
  tools: BenchmarkTools;
  clientId: string;
  projectId: string;
  competitors: string[];
  /** This server's origin, for a review link. */
  origin: string;
  requestedBy: string;
  now?: () => number;
}): Promise<RunOutcome> {
  const { store, tools, clientId, projectId, origin, requestedBy } = options;
  const now = options.now ?? Date.now;
  const permission = authorize("qa", "read_context");
  if (!permission.allowed) return { status: 503, body: { error: permission.reason } };

  const competitors: string[] = [];
  for (const typed of options.competitors.map((c) => c.trim()).filter(Boolean)) {
    let url: string;
    try {
      url = tools.checkUrl(typed);
    } catch (error) {
      return { status: 400, body: { error: `${typed}: ${error instanceof Error ? error.message : "not a web address."}` } };
    }
    if (!competitors.some((c) => hostOf(c) === hostOf(url))) competitors.push(url);
  }
  if (competitors.length === 0) return { status: 400, body: { error: "Add at least one competitor's web address." } };
  if (competitors.length > MAX_COMPETITORS) return { status: 400, body: { error: `Compare with at most ${MAX_COMPETITORS} competitors.` } };

  const [loaded, project] = await Promise.all([store.loadClient(clientId), store.loadProject(projectId)]);
  if (!loaded || !project || project.clientId !== clientId) return { status: 404, body: { error: "This project does not exist, or you do not have access to it." } };
  const ours = await store.ourSite(projectId);
  if (!ours) return { status: 409, body: { error: "Build the site first: the comparison reads its review link, or its address once it is published." } };
  const ourUrl = ours.published ? ours.url : new URL(ours.url, origin).toString();

  const active = await store.activeRun(clientId);
  if (active) {
    if (now() - Date.parse(active.startedAt ?? active.createdAt) < STALE_BENCHMARK_MS) return { status: 202, body: { run: active, reused: true } };
    await store.finishRun(active.id, { status: "failed", error: { message: "The comparison did not finish in time.", retryable: true } });
  }
  if ((await store.runsSince(new Date(now() - 3_600_000).toISOString())) >= MAX_RUNS_PER_HOUR) {
    return { status: 429, body: { error: "The studio has reached its hourly limit for agent requests. Try again later." } };
  }

  const inputs: EntityRef[] = [
    { type: "client", id: clientId },
    { type: "project", id: projectId },
    ...competitors.map((url) => ({ type: "artifact" as const, id: `competitor:${hostOf(url)}`, label: hostOf(url), url })),
  ];
  const run = await store.insertRun({
    clientId,
    idempotencyKey: `qa.benchmark:${projectId}:${randomUUID()}`,
    attempt: 1,
    status: "running",
    requestedBy,
    inputs,
    runner: "benchmark",
    model: null,
    promptVersion: BENCHMARK_VERSION,
    blocker: null,
  });
  if (!run) return { status: 409, body: { error: "Another comparison just started. Reload to see it." } };
  await store.recordEvent(clientId, "agent.run_started", `Competitor comparison started: ${competitors.map(hostOf).join(", ")}`);

  try {
    const [mine, ...theirs] = await Promise.all([
      measure("ours", ourUrl, tools, ours.published, ours.published ? null : "Measured after publishing: the review link is private and is not sent to Google."),
      ...competitors.map((url) => measure("competitor", url, tools, true, null)),
    ]);
    const comparison = compareSites(mine, theirs);
    const result: BenchmarkResult = {
      kind: "benchmark",
      // The review link is a private key: keep only that it was one.
      ours: { ...mine, url: ours.published ? mine.url : "review link", page: mine.page ? { ...mine.page, url: ours.published ? mine.page.url : "review link" } : null, published: ours.published },
      competitors: theirs,
      comparison,
      measuredAt: new Date(now()).toISOString(),
      externalResearch: true,
    };
    const finished = await store.finishRun(run.id, { status: "succeeded", result });
    await store.recordEvent(clientId, "agent.run_completed", `Competitor comparison: ahead on ${comparison.ahead}, behind on ${comparison.behind}`);
    return { status: 200, body: { run: finished } };
  } catch {
    const finished = await store.finishRun(run.id, { status: "failed", error: { message: "The comparison could not be finished. Try again.", retryable: true } });
    await store.recordEvent(clientId, "agent.run_failed", "Competitor comparison failed");
    return { status: 200, body: { run: finished } };
  }
}
