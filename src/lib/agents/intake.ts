/**
 * Client Intake & Research: the agent's input, its output contract, and the
 * checks applied to what the model returns before anything is stored.
 *
 * The model is treated as untrusted: its output is validated against a
 * schema, every proposed value must quote its source verbatim (checked here,
 * not taken on trust), and the result only ever becomes proposals that a
 * person reviews.
 */
import { z } from "zod";
import type { IntakeResult } from "./contract";
import { INTAKE_PROMPT_VERSION } from "./intake-prompt";
import { PROPOSAL_TARGETS, type Evidence, type FieldConfidence, type ProposalTarget, type SourceType } from "@/lib/domain/types";

/** Hard limits per run, so a run stays fast, cheap and reviewable. */
export const INTAKE_LIMITS = {
  /** All source material together. Longer material is refused, never silently cut. */
  maxInputCharacters: 60_000,
  maxSources: 20,
  maxProposals: 15,
  maxQuestions: 8,
  maxListItems: 8,
  maxValueLength: 2000,
  maxQuoteLength: 500,
  minQuoteLength: 3,
} as const;

export interface IntakeSource {
  id: string;
  label: string;
  type: SourceType;
  content: string;
}

/**
 * Everything the agent is given. It sees nothing else: no database, no tools,
 * no web. Only what the analysis needs: the contact's email address, for
 * example, is left out.
 */
export interface IntakeInput {
  client: { name: string; contactPerson: string | null; website: string | null };
  /** What the brief already says, so the agent can spot conflicts and gaps. */
  brief: { target: ProposalTarget; value: string; confidence: FieldConfidence }[];
  sources: IntakeSource[];
}

/** The structured output the model must return. */
export const intakeModelOutput = z.object({
  proposals: z.array(
    z.object({
      target: z.enum(PROPOSAL_TARGETS),
      value: z.string(),
      evidence: z.array(z.object({ sourceId: z.string(), quote: z.string() })),
      note: z.string().nullable(),
    }),
  ),
  missing: z.array(z.object({ target: z.enum(PROPOSAL_TARGETS).nullable(), description: z.string() })),
  ambiguities: z.array(z.object({ description: z.string(), sourceId: z.string().nullable(), quote: z.string().nullable() })),
  questions: z.array(z.string()),
  summary: z.string(),
  nextSteps: z.array(z.string()),
});
export type IntakeModelOutput = z.infer<typeof intakeModelOutput>;

export interface ProposalDraft {
  target: ProposalTarget;
  value: string;
  evidence: Evidence[];
  note: string | null;
}

export interface NormalizedIntake {
  proposals: ProposalDraft[];
  result: IntakeResult;
}

/** Refuses input that is empty or too large, with a reason a person can act on. */
export function checkIntakeInput(input: IntakeInput): { ok: true } | { ok: false; blocker: string } {
  const sources = input.sources.filter((source) => source.content.trim());
  if (sources.length === 0) {
    return { ok: false, blocker: "There is no source material to analyze. Add the client's email, notes or brief under Source material first." };
  }
  if (sources.length > INTAKE_LIMITS.maxSources) {
    return { ok: false, blocker: `There are ${sources.length} sources; one analysis reads at most ${INTAKE_LIMITS.maxSources}.` };
  }
  const characters = sources.reduce((sum, source) => sum + source.content.length, 0);
  if (characters > INTAKE_LIMITS.maxInputCharacters) {
    return {
      ok: false,
      blocker: `The source material is too long to analyze in one run (${characters.toLocaleString("en")} characters; the limit is ${INTAKE_LIMITS.maxInputCharacters.toLocaleString("en")}). Nothing was cut; shorten or split the material.`,
    };
  }
  return { ok: true };
}

/**
 * Validates the model's output and keeps only what the sources support.
 * Throws when the output does not match the contract at all.
 */
export function normalizeIntakeOutput(raw: unknown, input: IntakeInput): NormalizedIntake {
  const output = intakeModelOutput.parse(raw);
  const sources = new Map(input.sources.map((source) => [source.id, source]));
  const current = new Map(input.brief.map((entry) => [entry.target, entry]));
  const seen = new Set<string>();
  const proposals: ProposalDraft[] = [];
  let discarded = 0;

  for (const proposal of output.proposals) {
    const value = proposal.value.trim();
    const evidence: Evidence[] = [];
    for (const item of proposal.evidence.slice(0, 5)) {
      const source = sources.get(item.sourceId);
      const quote = item.quote.trim();
      if (!source || quote.length < INTAKE_LIMITS.minQuoteLength || quote.length > INTAKE_LIMITS.maxQuoteLength) continue;
      if (!containsQuote(source.content, quote)) continue;
      evidence.push({ sourceId: source.id, sourceLabel: source.label, quote });
    }
    // No verifiable quote, no proposal: the agent may not invent facts.
    if (!value || value.length > INTAKE_LIMITS.maxValueLength || evidence.length === 0) {
      discarded++;
      continue;
    }
    // A value the brief already holds needs no review.
    const existing = current.get(proposal.target);
    if (existing && sameText(existing.value, value)) continue;
    const key = `${proposal.target}:${normalize(value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    proposals.push({ target: proposal.target, value, evidence, note: clip(proposal.note, 1000) });
    if (proposals.length >= INTAKE_LIMITS.maxProposals) break;
  }

  const list = (items: string[]) => items.map((item) => item.trim()).filter(Boolean).slice(0, INTAKE_LIMITS.maxListItems).map((item) => clip(item, 500)!);

  return {
    proposals,
    result: {
      summary: clip(output.summary.trim(), 2000) ?? "",
      missing: output.missing
        .filter((item) => item.description.trim())
        .slice(0, INTAKE_LIMITS.maxListItems)
        .map((item) => ({ target: item.target, description: clip(item.description.trim(), 500)! })),
      ambiguities: output.ambiguities
        .filter((item) => item.description.trim())
        .slice(0, INTAKE_LIMITS.maxListItems)
        .map((item) => {
          const source = item.sourceId ? sources.get(item.sourceId) : undefined;
          const quote = item.quote?.trim() || null;
          // Keep a quote only when it is really in the cited source.
          const verified = source && quote && containsQuote(source.content, quote) ? quote : null;
          return { description: clip(item.description.trim(), 500)!, sourceId: verified ? source!.id : null, quote: verified };
        }),
      questions: list(output.questions).slice(0, INTAKE_LIMITS.maxQuestions),
      nextSteps: list(output.nextSteps),
      analyzedSources: input.sources.map((source) => ({ id: source.id, label: source.label, characters: source.content.length })),
      discardedProposals: discarded,
      externalResearch: false,
    },
  };
}

/** Whether `quote` appears in `text`, ignoring case, spacing and quote-mark style. */
export function containsQuote(text: string, quote: string): boolean {
  return normalize(text).includes(normalize(quote));
}

function normalize(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function sameText(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function clip(text: string | null, max: number): string | null {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * A fingerprint of everything the agent will read. The same material gives
 * the same fingerprint, so asking again reuses the earlier run.
 */
export async function intakeFingerprint(input: IntakeInput): Promise<string> {
  const material = JSON.stringify({
    v: 2,
    prompt: INTAKE_PROMPT_VERSION,
    client: input.client,
    brief: [...input.brief].sort((a, b) => a.target.localeCompare(b.target)),
    sources: [...input.sources].sort((a, b) => a.id.localeCompare(b.id)).map((s) => [s.id, s.label, s.type, s.content]),
  });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest).slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
