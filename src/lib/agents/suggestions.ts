/**
 * Where an intake analysis's questions belong in the brief. A question the
 * analysis tied to a brief field is offered on that field's onboarding
 * question, so the gap and the way to close it sit together.
 */
import type { ProposalTarget } from "@/lib/domain/types";
import { intakeResultOf, type AgentRunRecord } from "./contract";

/**
 * The analysis's questions for one brief field that are not already open
 * questions (compared ignoring case and surrounding space).
 */
export function questionsFor(run: AgentRunRecord | undefined, target: ProposalTarget, alreadyAsked: readonly string[]): string[] {
  const result = intakeResultOf(run);
  if (!result?.questionTargets) return [];
  const asked = new Set(alreadyAsked.map(normalize));
  return result.questions.filter((question, i) => result.questionTargets?.[i] === target && !asked.has(normalize(question)));
}

/** Whether the analysis found nothing about this field in the material. */
export function reportedMissing(run: AgentRunRecord | undefined, target: ProposalTarget): boolean {
  return Boolean(intakeResultOf(run)?.missing.some((item) => item.target === target));
}

function normalize(text: string) {
  return text.trim().toLocaleLowerCase();
}
