import type { IntakeInput, IntakeModelOutput } from "@/lib/agents/intake";
import { CONTEXT_FIELD_KEYS, type ProposalTarget } from "@/lib/domain/types";
import { ModelError, type IntakeModel, type ModelAnswer } from "./model";

/**
 * A deterministic stand-in for a model, for automated tests only. It uses no
 * AI: it reads lines of the form "Label: value" and proposes exactly those,
 * quoting the line. It is enabled only when explicitly configured, and runs
 * it produces are labeled as coming from a test provider.
 *
 * A source containing "FIXTURE_FAIL" makes it fail, and one containing
 * "FIXTURE_MALFORMED" makes it answer in the wrong shape, to test error
 * handling. It reports token usage like a provider would (about four
 * characters a token), priced at nothing.
 */
export class FixtureIntakeModel implements IntakeModel {
  readonly runner = "fixture";
  readonly model = "test-fixture";
  readonly test = true;
  readonly maxOutputTokens = 16000;

  async analyze(input: IntakeInput, signal: AbortSignal): Promise<ModelAnswer> {
    if (signal.aborted) throw new ModelError("The analysis took too long and was stopped.", true, "nothing");
    if (input.sources.some((source) => source.content.includes("FIXTURE_FAIL"))) {
      throw new ModelError("The test provider was asked to fail.", true, "nothing");
    }
    const characters = input.sources.reduce((sum, source) => sum + source.content.length, 0);
    const usage = { inputTokens: Math.ceil(characters / 4) + 1500, outputTokens: 600, cacheReadTokens: 0, cacheWriteTokens: 0 };
    if (input.sources.some((source) => source.content.includes("FIXTURE_MALFORMED"))) {
      return { output: { proposals: "not a list", summary: 42 }, usage, servedBy: this.model };
    }
    return { output: this.answer(input), usage, servedBy: this.model };
  }

  private answer(input: IntakeInput): IntakeModelOutput {
    const proposals: IntakeModelOutput["proposals"] = [];
    for (const source of input.sources) {
      for (const line of source.content.split(/\r?\n/)) {
        const match = /^\s*([A-Za-z ]+):\s*(.+?)\s*$/.exec(line);
        const target = match ? LABELS[match[1].trim().toLowerCase()] : undefined;
        if (match && target) {
          proposals.push({ target, value: match[2], evidence: [{ sourceId: source.id, quote: line.trim() }], note: null });
        }
      }
    }
    const found = new Set(proposals.map((p) => p.target));
    const missing = CONTEXT_FIELD_KEYS.filter((key) => !found.has(key) && !input.brief.some((b) => b.target === key));
    return {
      proposals,
      missing: missing.map((target) => ({ target, description: `The material does not say anything about ${target}.` })),
      ambiguities: [],
      questions: missing.slice(0, 3).map((target) => ({ question: `What is the ${target} for this project?`, target })),
      summary: `Test analysis of ${input.sources.length} source(s) for ${input.client.name}. ${proposals.length} value(s) found as labeled lines.`,
      nextSteps: ["Review the proposed values."],
    };
  }
}

const LABELS: Record<string, ProposalTarget> = {
  goal: "goal",
  requirements: "requirements",
  audience: "targetAudience",
  "target audience": "targetAudience",
  budget: "budget",
  deadline: "deadline",
  platform: "platform",
  company: "companyName",
  contact: "contactPerson",
  "contact person": "contactPerson",
  email: "email",
  website: "website",
};
