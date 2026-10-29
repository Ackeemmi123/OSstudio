import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { intakeModelOutput, type IntakeInput } from "@/lib/agents/intake";
import { buildIntakeMessage, INTAKE_SYSTEM_PROMPT } from "@/lib/agents/intake-prompt";
import { planModelOutput, type PlanInput } from "@/lib/agents/plan";
import { buildPlanMessage, PLAN_SYSTEM_PROMPT } from "@/lib/agents/plan-prompt";
import type { CallAttempt, TokenUsage } from "@/lib/agents/pricing";
import { ModelError, type AgentModel, type ModelAnswer, type Spent } from "./model";

/** Where the API key is sent. Never taken from ANTHROPIC_BASE_URL implicitly. */
export const ANTHROPIC_API_URL = "https://api.anthropic.com";

/**
 * Claude, through the Anthropic API, with structured output. One request per
 * run, no tools: the model only reads what it is given.
 */
export class AnthropicModel implements AgentModel {
  readonly runner = "anthropic";
  readonly test = false;
  readonly maxOutputTokens = { intake: 16000, plan: 4000 };
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {
    // The SDK would otherwise pick up ANTHROPIC_BASE_URL from the environment
    // and send the key wherever it points.
    this.client = new Anthropic({ apiKey, baseURL: ANTHROPIC_API_URL, maxRetries: 1, timeout: timeoutMs });
  }

  analyze(input: IntakeInput, signal: AbortSignal): Promise<ModelAnswer> {
    return this.call(
      { system: INTAKE_SYSTEM_PROMPT, message: buildIntakeMessage(input), schema: intakeModelOutput, maxTokens: this.maxOutputTokens.intake, effort: "medium" },
      signal,
    );
  }

  suggestTasks(input: PlanInput, signal: AbortSignal): Promise<ModelAnswer> {
    return this.call(
      { system: PLAN_SYSTEM_PROMPT, message: buildPlanMessage(input), schema: planModelOutput, maxTokens: this.maxOutputTokens.plan, effort: "low" },
      signal,
    );
  }

  private async call(
    request: { system: string; message: string; schema: typeof intakeModelOutput | typeof planModelOutput; maxTokens: number; effort: "low" | "medium" },
    signal: AbortSignal,
  ): Promise<ModelAnswer> {
    let response;
    try {
      response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: request.maxTokens,
          system: request.system,
          messages: [{ role: "user", content: request.message }],
          output_config: { effort: request.effort, format: betaZodOutputFormat(request.schema) },
          // If the model declines, the API retries on a fallback model it chooses.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal, timeout: this.timeoutMs },
      );
    } catch (error) {
      throw toModelError(error);
    }

    const spent = toSpent(response);
    if (response.stop_reason === "refusal") {
      throw new ModelError("The model declined this request.", false, spent);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ModelError("The model's answer was cut off before it finished.", true, spent);
    }
    if (!response.parsed_output) {
      throw new ModelError("The model did not return a valid answer.", true, spent);
    }
    return { output: response.parsed_output, ...spent };
  }
}

interface ReportedUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * What the call used. The top-level usage covers only the attempt that
 * produced the answer; after a fallback, `usage.iterations` lists every
 * attempt, including the one that declined, so the cost is taken from there.
 */
export function toSpent(response: { model?: string | null; usage: ReportedUsage & { iterations?: ReadonlyArray<ReportedUsage & { type?: string; model?: string | null }> | null } }): Spent {
  const servedBy = response.model ?? null;
  const iterations = response.usage.iterations ?? [];
  if (!iterations.length) return { usage: toUsage(response.usage), servedBy };
  const attempts: CallAttempt[] = iterations.map((entry) => ({ usage: toUsage(entry), model: entry.model ?? null }));
  const usage = attempts.reduce<TokenUsage>(
    (sum, { usage: u }) => ({
      inputTokens: sum.inputTokens + u.inputTokens,
      outputTokens: sum.outputTokens + u.outputTokens,
      cacheReadTokens: sum.cacheReadTokens + u.cacheReadTokens,
      cacheWriteTokens: sum.cacheWriteTokens + u.cacheWriteTokens,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  );
  return { usage, servedBy, attempts };
}

function toUsage(usage: ReportedUsage): TokenUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function toModelError(error: unknown): ModelError {
  if (error instanceof Anthropic.APIUserAbortError || (error instanceof Error && error.name === "AbortError")) {
    // The provider may have started and billed the call.
    return new ModelError("The request took too long and was stopped.", true, null);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ModelError("The AI provider rejected the server's credentials. An administrator needs to check the configuration.", false, "nothing");
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new ModelError("The AI provider rejected the request. An administrator needs to check the model configuration.", false, "nothing");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ModelError("The AI provider is busy. Try again in a minute.", true, "nothing");
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
    return new ModelError("The AI provider could not be reached. Try again in a minute.", true);
  }
  if (error instanceof Anthropic.APIError) {
    return new ModelError(`The AI provider returned an error (${error.status ?? "unknown"}).`, (error.status ?? 500) >= 500);
  }
  return new ModelError("The request failed unexpectedly.", true);
}
