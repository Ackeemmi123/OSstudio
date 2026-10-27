/**
 * The seam between the intake agent and a model provider. A provider gets
 * the prepared input and returns raw structured output; validation and
 * evidence checks happen afterwards, the same for every provider.
 */
import type { IntakeInput } from "@/lib/agents/intake";

export interface IntakeModel {
  /** Recorded on the run, e.g. "anthropic". Never a credential. */
  readonly runner: string;
  readonly model: string | null;
  /** True for the deterministic test provider, which uses no AI. */
  readonly test: boolean;
  analyze(input: IntakeInput, signal: AbortSignal): Promise<unknown>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    /** Whether trying again later could succeed. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelError";
  }
}
