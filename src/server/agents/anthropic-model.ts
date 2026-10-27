import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { intakeModelOutput, type IntakeInput } from "@/lib/agents/intake";
import { buildIntakeMessage, INTAKE_SYSTEM_PROMPT } from "@/lib/agents/intake-prompt";
import { ModelError, type IntakeModel } from "./model";

/**
 * Claude, through the Anthropic API, with structured output. One request per
 * run, no tools: the model only reads the material it is given.
 */
export class AnthropicIntakeModel implements IntakeModel {
  readonly runner = "anthropic";
  readonly test = false;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
  ) {
    this.client = new Anthropic({ apiKey, maxRetries: 1, timeout: timeoutMs });
  }

  async analyze(input: IntakeInput, signal: AbortSignal): Promise<unknown> {
    let response;
    try {
      response = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: 16000,
          system: INTAKE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildIntakeMessage(input) }],
          output_config: { effort: "medium", format: betaZodOutputFormat(intakeModelOutput) },
          // If the model declines, the API retries on a fallback model it chooses.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal, timeout: this.timeoutMs },
      );
    } catch (error) {
      throw toModelError(error);
    }

    if (response.stop_reason === "refusal") {
      throw new ModelError("The model declined to analyze this material.", false);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ModelError("The model's answer was cut off before it finished.", true);
    }
    if (!response.parsed_output) {
      throw new ModelError("The model did not return a valid analysis.", true);
    }
    return response.parsed_output;
  }
}

function toModelError(error: unknown): ModelError {
  if (error instanceof Anthropic.APIUserAbortError || (error instanceof Error && error.name === "AbortError")) {
    return new ModelError("The analysis took too long and was stopped.", true);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ModelError("The AI provider rejected the server's credentials. An administrator needs to check the configuration.", false);
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    return new ModelError("The AI provider rejected the request. An administrator needs to check the model configuration.", false);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new ModelError("The AI provider is busy. Try again in a minute.", true);
  }
  if (error instanceof Anthropic.APIConnectionError || error instanceof Anthropic.InternalServerError) {
    return new ModelError("The AI provider could not be reached. Try again in a minute.", true);
  }
  if (error instanceof Anthropic.APIError) {
    return new ModelError(`The AI provider returned an error (${error.status ?? "unknown"}).`, (error.status ?? 500) >= 500);
  }
  return new ModelError("The analysis failed unexpectedly.", true);
}
