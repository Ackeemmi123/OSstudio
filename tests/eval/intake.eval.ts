/**
 * Runs the intake agent on the synthetic evaluation set and prints a report.
 *
 * By default it uses the free test provider, which checks the harness and the
 * safety rules but not the model's quality. Running it against Claude costs
 * money, so it needs all of: EVAL_PROVIDER=anthropic, ANTHROPIC_API_KEY, and
 * EVAL_SPEND_APPROVED=yes (only after Alexander approves the spend). Before
 * each case it stops if that case's worst cost could take the run past
 * EVAL_MAX_USD (default 2), so the run never spends more than the limit.
 */
import { describe, expect, it, vi } from "vitest";
import { normalizeIntakeOutput } from "@/lib/agents/intake";
import { gradeIntake, type CheckResult } from "@/lib/agents/eval/grade";
import { INTAKE_EVAL_CASES } from "@/lib/agents/eval/intake-cases";
import { intakeRequestBytes } from "@/lib/agents/intake-prompt";
import { formatUsd, spentMicros, worstCaseMicros } from "@/lib/agents/pricing";
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
    const limit = Number(process.env.EVAL_MAX_USD ?? 2) * 1_000_000;
    let spent = 0;
    const report: { id: string; results: CheckResult[] }[] = [];
    for (const testCase of INTAKE_EVAL_CASES) {
      // Never start a case whose worst case could take the run past the limit.
      const worst = worstCaseMicros(model.model ?? "", intakeRequestBytes(testCase.input), model.maxOutputTokens)!;
      if (!model.test && spent + worst > limit) throw new Error(`Stopped before ${testCase.id}: ${formatUsd(spent)} spent, and its worst case of ${formatUsd(worst)} could pass the ${formatUsd(limit)} limit.`);
      const answer = await model.analyze(testCase.input, AbortSignal.timeout(110_000));
      spent += spentMicros(answer);
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
