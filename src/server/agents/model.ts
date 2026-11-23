/**
 * The seam between the agents and a model provider. A provider gets the
 * prepared input and returns raw structured output; validation and evidence
 * checks happen afterwards, the same for every provider.
 */
import type { IntakeInput } from "@/lib/agents/intake";
import type { PlanInput } from "@/lib/agents/plan";
import type { SiteDraftInput } from "@/lib/agents/site-draft";
import type { WarmTextInput } from "@/lib/agents/warm-text";
import type { CallAttempt, TokenUsage } from "@/lib/agents/pricing";

/** What a call used, as the provider reported it. */
export interface Spent {
  /** Tokens across every attempt. */
  usage: TokenUsage;
  /** The model that answered, which can differ from the one asked after a fallback. */
  servedBy: string | null;
  /** Each attempt, when the provider reports them separately (after a fallback). */
  attempts?: CallAttempt[];
}

export interface ModelAnswer extends Spent {
  /** The raw structured output, not yet validated. */
  output: unknown;
}

export interface AgentModel {
  /** Recorded on the run, e.g. "anthropic". Never a credential. */
  readonly runner: string;
  readonly model: string | null;
  /** True for the deterministic test provider, which uses no AI. */
  readonly test: boolean;
  /** The output allowance per call of each kind, used to reserve the most a call could cost. */
  readonly maxOutputTokens: { intake: number; plan: number; draft: number; warm: number };
  /** Client intake: proposes brief values from source material. */
  analyze(input: IntakeInput, signal: AbortSignal): Promise<ModelAnswer>;
  /** Project coordination: suggests changes to a new project's starting tasks. */
  suggestTasks(input: PlanInput, signal: AbortSignal): Promise<ModelAnswer>;
  /** Website draft: proposes a whole SiteSpec from the client's text material and kept files. */
  draftSite(input: SiteDraftInput, signal: AbortSignal): Promise<ModelAnswer>;
  /** Warmer text: proposes rewordings of a spec's texts in the client's own voice. */
  warmText(input: WarmTextInput, signal: AbortSignal): Promise<ModelAnswer>;
}

export class ModelError extends Error {
  constructor(
    message: string,
    /** Whether trying again later could succeed. */
    readonly retryable: boolean,
    /**
     * What the failed call cost, when the provider said. Null when unknown,
     * for example after a timeout: the call may still have been billed.
     */
    readonly spent: Spent | "nothing" | null = null,
  ) {
    super(message);
    this.name = "ModelError";
  }
}
