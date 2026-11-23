import type { Comparison, MeasuredSite } from "./compare";

/** A competitor comparison, stored on a qa.benchmark run. */
export interface BenchmarkResult {
  kind: "benchmark";
  ours: MeasuredSite & { published: boolean };
  competitors: MeasuredSite[];
  comparison: Comparison;
  measuredAt: string;
  /** True: unlike the other agents, this one reads public web pages outside the studio's material. */
  externalResearch: true;
}

export const BENCHMARK_VERSION = "benchmark-2026-11-23.1";
export const MAX_COMPETITORS = 3;
