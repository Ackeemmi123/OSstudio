import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { intakeModelOutput, type IntakeInput } from "@/lib/agents/intake";
import { buildIntakeMessage, INTAKE_SYSTEM_PROMPT } from "@/lib/agents/intake-prompt";
import { planModelOutput, type PlanInput } from "@/lib/agents/plan";
import { buildPlanMessage, PLAN_SYSTEM_PROMPT } from "@/lib/agents/plan-prompt";
import type { CallAttempt, TokenUsage } from "@/lib/agents/pricing";
import { siteDraftModelOutput, type SiteDraftInput } from "@/lib/agents/site-draft";
import { buildSiteDraftMessage, SITE_DRAFT_SYSTEM_PROMPT } from "@/lib/agents/site-draft-prompt";
import { warmTextModelOutput, type WarmTextInput } from "@/lib/agents/warm-text";
import { buildWarmTextMessage, WARM_TEXT_SYSTEM_PROMPT } from "@/lib/agents/warm-text-prompt";
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
  readonly maxOutputTokens = { intake: 16000, plan: 4000, draft: 48000, warm: 12000 };
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string,
    private readonly timeoutMs: number,
    /** A website draft writes far more, so it gets longer. */
    private readonly draftTimeoutMs = 280_000,
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

  /**
   * Kept PDFs and images go first as their own blocks, then the text. The
   * answer is long, so it is streamed and read whole at the end.
   */
  draftSite(input: SiteDraftInput, signal: AbortSignal): Promise<ModelAnswer> {
    const files: Anthropic.Beta.Messages.BetaContentBlockParam[] = input.files.map((file) =>
      file.mimeType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: file.data }, title: file.title.slice(0, 200) }
        : { type: "image", source: { type: "base64", media_type: file.mimeType, data: file.data } },
    );
    return this.call(
      {
        system: SITE_DRAFT_SYSTEM_PROMPT,
        message: [...files, { type: "text", text: buildSiteDraftMessage(input) }],
        schema: siteDraftModelOutput,
        maxTokens: this.maxOutputTokens.draft,
        effort: "medium",
        stream: true,
        timeoutMs: this.draftTimeoutMs,
        // The draft's shape is too large for the API to compile into a strict grammar, so the schema
        // goes in the instructions and the answer is checked here against the same schema.
        schemaInPrompt: true,
      },
      signal,
    );
  }

  warmText(input: WarmTextInput, signal: AbortSignal): Promise<ModelAnswer> {
    return this.call(
      { system: WARM_TEXT_SYSTEM_PROMPT, message: buildWarmTextMessage(input), schema: warmTextModelOutput, maxTokens: this.maxOutputTokens.warm, effort: "medium", stream: true, timeoutMs: this.draftTimeoutMs },
      signal,
    );
  }

  private async call(
    request: {
      system: string;
      message: string | Anthropic.Beta.Messages.BetaContentBlockParam[];
      schema: typeof intakeModelOutput | typeof planModelOutput | typeof siteDraftModelOutput | typeof warmTextModelOutput;
      maxTokens: number;
      effort: "low" | "medium";
      stream?: boolean;
      timeoutMs?: number;
      schemaInPrompt?: boolean;
    },
    signal: AbortSignal,
  ): Promise<ModelAnswer> {
    const params = {
      model: this.model,
      max_tokens: request.maxTokens,
      system: request.schemaInPrompt ? `${request.system}\n\n${jsonAnswerInstruction(request.schema)}` : request.system,
      messages: [{ role: "user" as const, content: request.message }],
      output_config: request.schemaInPrompt ? { effort: request.effort } : { effort: request.effort, format: betaZodOutputFormat(request.schema) },
      // If the model declines, the API retries on a fallback model it chooses.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default" as const,
    };
    const options = { signal, timeout: request.timeoutMs ?? this.timeoutMs };
    let response;
    try {
      response = request.stream ? await this.client.beta.messages.stream(params, options).finalMessage() : await this.client.beta.messages.parse(params, options);
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
    if (request.schemaInPrompt) {
      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      const output = parseJsonAnswer(text, request.schema);
      if (!output.ok) throw new ModelError(`The model did not return a valid answer: ${output.reason}`, true, spent);
      return { output: output.value, ...spent };
    }
    if (!response.parsed_output) {
      throw new ModelError("The model did not return a valid answer.", true, spent);
    }
    return { output: response.parsed_output, ...spent };
  }
}

/** What the model is told when the schema goes in the instructions instead of a strict output format. */
export function jsonAnswerInstruction(schema: z.ZodType): string {
  return [
    "Answer with one JSON object and nothing else: no words before or after it, and no code fence.",
    "It must match this JSON Schema exactly: every required field present, no other fields, and only the listed values where a field lists them.",
    JSON.stringify(z.toJSONSchema(schema)),
  ].join("\n");
}

/** The model's JSON answer, checked against the schema. A stray code fence or words around the object are tolerated. */
export function parseJsonAnswer(text: string, schema: z.ZodType): { ok: true; value: unknown } | { ok: false; reason: string } {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, reason: "no JSON object in the answer." };
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { ok: false, reason: "the JSON could not be read." };
  }
  const checked = schema.safeParse(data);
  if (!checked.success) {
    const first = checked.error.issues[0];
    return { ok: false, reason: `${first?.path.join(".") || "the answer"}: ${first?.message ?? "does not match the schema"}.` };
  }
  return { ok: true, value: checked.data };
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

/** The provider's own words for a rejected request, short, so staff can see what to fix. */
function providerMessage(error: InstanceType<typeof Anthropic.APIError>): string {
  const body = error.error as { error?: { message?: unknown } } | undefined;
  const said = typeof body?.error?.message === "string" ? body.error.message : "";
  return said.replace(/\s+/g, " ").trim().slice(0, 240);
}

export function toModelError(error: unknown): ModelError {
  if (error instanceof Anthropic.APIUserAbortError || (error instanceof Error && error.name === "AbortError")) {
    // The provider may have started and billed the call.
    return new ModelError("The request took too long and was stopped.", true, null);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ModelError("The AI provider rejected the server's credentials. An administrator needs to check the configuration.", false, "nothing");
  }
  if (error instanceof Anthropic.BadRequestError || error instanceof Anthropic.NotFoundError) {
    const said = providerMessage(error);
    if (/credit balance/i.test(said)) {
      return new ModelError("The AI account has run out of credit. An administrator needs to add credit in the Claude Console.", false, "nothing");
    }
    return new ModelError(
      `The AI provider rejected the request${said ? `: ${said}` : ""}. An administrator needs to check the model configuration.`,
      false,
      "nothing",
    );
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
