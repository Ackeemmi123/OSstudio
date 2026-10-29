/**
 * Runs the intake agent on the synthetic evaluation set and prints a report.
 *
 * By default it uses the free test provider, which checks the harness and the
 * safety rules but not the model's quality. Running it against Claude costs
 * money, so it needs all of: EVAL_PROVIDER=anthropic, ANTHROPIC_API_KEY, and
 * EVAL_SPEND_APPROVED=yes (only after Alexander approves the spend). It stops
 * before starting if the worst case for the whole set is over EVAL_MAX_USD
 * (default 2).
 */
import { describe, expect, it, vi } from "vitest";
import { normalizeIntakeOutput } from "@/lib/agents/intake";
import { gradeIntake, type CheckResult } from "@/lib/agents/eval/grade";
import { INTAKE_EVAL_CASES } from "@/lib/agents/eval/intake-cases";
import { costMicros, formatUsd, worstCaseMicros } from "@/lib/agents/pricing";
import { DEFAULT_INTAKE_MODEL } from "@/server/config";
import { AnthropicIntakeModel } from "@/server/agents/anthropic-model";
import { FixtureIntakeModel } from "@/server/agents/fixture-model";
import type { IntakeModel } from "@/server/agents/model";

vi.mock("server-only", () => ({}));

function provider(): IntakeModel {
  if (process.env.EVAL_PROVIDER !== "anthropic") return new FixtureIntakeModel();
  if (process.env.EVAL_SPEND_APPROVED !== "yes") throw new Error("Running the evaluation against Claude costs money. Set EVAL_SPEND_APPROVED=yes only after the spend is approved.");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set.");
  return new AnthropicIntakeModel(key, process.env.STUDIO_AGENT_MODEL ?? DEFAULT_INTAKE_MODEL, 110_000);
}

describe("intake evaluation set", () => {
  it("analyzes every case without breaking a safety rule", async () => {
    const model = provider();
    const worst = INTAKE_EVAL_CASES.reduce(
      (sum, c) => sum + worstCaseMicros(model.model ?? "", c.input.sources.reduce((n, s) => n + s.content.length, 0), model.maxOutputTokens)!,
      0,
    );
    const limit = Number(process.env.EVAL_MAX_USD ?? 2) * 1_000_000;
    if (!model.test && worst > limit) throw new Error(`The worst case for this run is ${formatUsd(worst)}, over the ${formatUsd(limit)} limit.`);

    let spent = 0;
    const report: { id: string; results: CheckResult[] }[] = [];
    for (const testCase of INTAKE_EVAL_CASES) {
      const answer = await model.analyze(testCase.input, AbortSignal.timeout(110_000));
      spent += costMicros(answer.usage, answer.servedBy);
      report.push({ id: testCase.id, results: gradeIntake(testCase, normalizeIntakeOutput(answer.output, testCase.input)) });
    }

    const all = report.flatMap((r) => r.results);
    const score = (kind: CheckResult["kind"]) => {
      const checks = all.filter((r) => r.kind === kind);
      return `${checks.filter((r) => r.passed).length}/${checks.length}`;
    };
    console.log(
      [
        `Intake evaluation · ${model.runner} ${model.model ?? ""} · ${INTAKE_EVAL_CASES.length} cases · cost ${formatUsd(spent)}`,
        `Safety ${score("safety")} · Recall ${score("recall")}`,
        ...report.flatMap((r) => r.results.filter((c) => !c.passed).map((c) => `  ✗ ${r.id}: ${c.check} (${c.kind})`)),
      ].join("\n"),
    );
    expect(all.filter((r) => r.kind === "safety" && !r.passed)).toEqual([]);
  });
});
