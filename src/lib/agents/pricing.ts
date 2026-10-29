/**
 * What model calls cost, and the most a call could cost before it is made.
 *
 * Amounts are whole micro-dollars (1 USD = 1 000 000), so they add up
 * exactly in the database. A price per million tokens in dollars is the
 * same number as micro-dollars per token.
 */

export interface ModelPrice {
  /** USD per million tokens. */
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Anthropic list prices (first-party API, checked 28 Oct 2026). A model that
 * is not listed cannot run: its cost could not be capped.
 */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  // The deterministic test provider uses no AI and costs nothing.
  "test-fixture": { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

/** The most expensive listed price, used when a response names a model that is not listed. */
const HIGHEST_PRICE: ModelPrice = Object.values(MODEL_PRICES).reduce((max, price) => ({
  input: Math.max(max.input, price.input),
  output: Math.max(max.output, price.output),
  cacheRead: Math.max(max.cacheRead, price.cacheRead),
  cacheWrite: Math.max(max.cacheWrite, price.cacheWrite),
}));

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function priceFor(model: string | null): ModelPrice | null {
  return model ? (MODEL_PRICES[model] ?? null) : null;
}

/**
 * The cost of a finished call. `servedBy` is the model that answered, which
 * can differ from the one requested when the provider falls back; an unknown
 * one is charged at the highest listed price, so the estimate never runs low.
 */
export function costMicros(usage: TokenUsage, servedBy: string | null): number {
  const price = priceFor(servedBy) ?? HIGHEST_PRICE;
  return Math.ceil(
    usage.inputTokens * price.input +
      usage.outputTokens * price.output +
      usage.cacheReadTokens * price.cacheRead +
      usage.cacheWriteTokens * price.cacheWrite,
  );
}

/**
 * The most one call could cost, reserved before it starts. Deliberately
 * pessimistic: every input character counted as a token, the full output
 * allowance used, and the whole call paid twice in case the provider declines
 * and a fallback model answers. A price at least as high as any fallback's is
 * used for both.
 */
export function worstCaseMicros(model: string, inputCharacters: number, maxOutputTokens: number): number | null {
  const price = priceFor(model);
  if (!price) return null;
  if (price.input === 0 && price.output === 0) return 0;
  const once = (inputCharacters + PROMPT_OVERHEAD_TOKENS) * HIGHEST_PRICE.input + maxOutputTokens * HIGHEST_PRICE.output;
  return Math.ceil(once * 2);
}

/** Room for the system prompt and message framing, in tokens. */
const PROMPT_OVERHEAD_TOKENS = 4_000;

export function formatUsd(micros: number): string {
  const usd = micros / 1_000_000;
  if (micros > 0 && usd < 0.01) return "under $0.01";
  return `$${usd.toFixed(2)}`;
}
