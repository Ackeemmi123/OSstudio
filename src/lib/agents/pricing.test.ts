import { describe, expect, it } from "vitest";
import { costMicros, formatUsd, MODEL_PRICES, worstCaseMicros } from "./pricing";

const usage = { inputTokens: 3_000, outputTokens: 4_000, cacheReadTokens: 1_000, cacheWriteTokens: 500 };

describe("model pricing", () => {
  it("prices a call in micro-dollars from the list price per million tokens", () => {
    // Claude Opus 5.5: $4 in, $20 out, $0.20 cache read, $5 cache write per million tokens.
    expect(costMicros(usage, "claude-opus-5-5")).toBe(3_000 * 4 + 4_000 * 20 + 1_000 * 0.2 + 500 * 5);
    expect(formatUsd(costMicros(usage, "claude-opus-5-5"))).toBe("$0.09");
  });

  it("charges an answer from an unlisted model at the highest listed price", () => {
    expect(costMicros(usage, "claude-something-new")).toBeGreaterThanOrEqual(Math.max(...Object.keys(MODEL_PRICES).map((m) => costMicros(usage, m))));
    expect(costMicros(usage, null)).toBe(costMicros(usage, "claude-something-new"));
  });

  it("reserves more than any call could cost, including a fallback answering after a refusal", () => {
    const worst = worstCaseMicros("claude-opus-5-5", 60_000, 16_000)!;
    const actualAtLimits = costMicros({ inputTokens: 60_000 / 3 + 4_000, outputTokens: 16_000, cacheReadTokens: 0, cacheWriteTokens: 0 }, "claude-opus-5-5");
    expect(worst).toBeGreaterThan(2 * actualAtLimits);
    expect(formatUsd(worstCaseMicros("claude-opus-5-5", 3_000, 16_000)!)).toBe("$0.87");
  });

  it("will not estimate a model it has no price for, and reserves nothing for the free test provider", () => {
    expect(worstCaseMicros("claude-unknown", 100, 16_000)).toBeNull();
    expect(worstCaseMicros("test-fixture", 100, 16_000)).toBe(0);
  });

  it("formats small amounts honestly", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(4_000)).toBe("under $0.01");
    expect(formatUsd(25_000_000)).toBe("$25.00");
  });
});
