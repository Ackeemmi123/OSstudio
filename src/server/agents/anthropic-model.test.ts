import { describe, expect, it } from "vitest";
import { spentMicros } from "@/lib/agents/pricing";
import { toSpent } from "./anthropic-model";

const reported = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 });

describe("what an Anthropic call used", () => {
  it("takes the top-level usage when the provider made one attempt", () => {
    const spent = toSpent({ model: "claude-opus-5-5", usage: { ...reported(2_000, 500), iterations: null } });
    expect(spent).toEqual({ usage: { inputTokens: 2_000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0 }, servedBy: "claude-opus-5-5" });
  });

  it("adds up every attempt after a fallback, because the top-level usage covers only the answer", () => {
    const spent = toSpent({
      model: "claude-opus-4-8",
      usage: {
        // The top-level usage is only the fallback model's attempt.
        ...reported(5_000, 3_000),
        iterations: [
          { type: "message", model: "claude-opus-5-5", ...reported(5_000, 1_200) },
          { type: "fallback_message", model: "claude-opus-4-8", ...reported(5_000, 3_000) },
        ],
      },
    });
    expect(spent.usage).toEqual({ inputTokens: 10_000, outputTokens: 4_200, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(spent.servedBy).toBe("claude-opus-4-8");
    expect(spentMicros(spent)).toBe(5_000 * 4 + 1_200 * 20 + 5_000 * 5 + 3_000 * 25);
  });

  it("charges an attempt that names no model at the highest listed price", () => {
    const spent = toSpent({ model: "claude-opus-5-5", usage: { ...reported(1_000, 1_000), iterations: [{ ...reported(1_000, 1_000), model: null }] } });
    expect(spentMicros(spent)).toBe(1_000 * 5 + 1_000 * 25);
  });
});
