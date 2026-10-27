/**
 * Guided onboarding: a short, adaptive pass that fills in the client's brief.
 *
 * The onboarding record only tracks progress (status, step, skipped
 * questions). Every answer is written to the client's details or brief with
 * the same rules as editing by hand, so the brief stays the one source of
 * truth and is editable after onboarding.
 *
 * Rules enforced here, whatever the UI does:
 * - Only a person answers onboarding questions. Agents propose values through
 *   `AgentProposal`s, which a person reviews.
 * - Only values that differ from the brief are written, so an observed or
 *   proposed value the person did not touch keeps its confidence.
 * - "Confirmed" is only ever set by a person (see `setContextField`).
 */
import { BRIEF_FIELD, BriefError, briefConditions, decodeSalesChannels, encodeSalesChannels, getBriefGaps } from "./brief";
import { clean, clientEvent, DomainError, formatList, setContextField, toClientDetailsInput, updateClientDetails, type DomainDeps } from "./clients";
import { addContextItem, QUESTION_MAX_LENGTH } from "./intake";
import { CONTEXT_FIELD_LABELS } from "./labels";
import {
  CONTEXT_FIELD_KEYS,
  ONBOARDING_STEPS,
  type ActivityEvent,
  type Client,
  type ContextFieldKey,
  type ContextItem,
  type Onboarding,
  type OnboardingStep,
  type OnboardingStepInput,
  type SourceReference,
} from "./types";
import { hasErrors, isValidWebAddress, validateClientIdentity, type FieldErrors } from "./validation";

/** Matches the database limit on a brief value. */
export const ANSWER_MAX_LENGTH = 5000;

export const ONBOARDING_SOURCE: SourceReference = { type: "manual", label: "Onboarding" };

function requirePerson(deps: DomainDeps) {
  if (deps.actor.kind !== "human") {
    throw new DomainError("Only a person can answer onboarding questions. Agents propose values for review instead.");
  }
}

export function buildOnboarding(
  client: Client,
  deps: DomainDeps,
  projectId: string | null = null,
): { onboarding: Onboarding; event: ActivityEvent } {
  requirePerson(deps);
  const now = deps.now();
  return {
    onboarding: {
      id: deps.createId(),
      clientId: client.id,
      projectId,
      status: "draft",
      currentStep: "business",
      skipped: [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    },
    event: clientEvent(client.id, "onboarding.started", "Started guided onboarding", deps, now),
  };
}

/** The client's onboarding (one per client, or per project once projects get their own). */
export function findOnboarding(onboardings: Onboarding[], clientId: string, projectId: string | null = null): Onboarding | undefined {
  return onboardings.find((o) => o.clientId === clientId && o.projectId === projectId);
}

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export function adjacentStep(step: OnboardingStep, direction: 1 | -1): OnboardingStep {
  const index = Math.min(Math.max(stepIndex(step) + direction, 0), ONBOARDING_STEPS.length - 1);
  return ONBOARDING_STEPS[index];
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

export type OnboardingFieldName = ContextFieldKey | "contactPerson" | "email" | "website" | "questions";

/** Checks one step's input. Shared by the form (inline errors) and the domain (enforcement). */
export function validateOnboardingStep(client: Client, input: OnboardingStepInput): FieldErrors<OnboardingFieldName> {
  const errors: FieldErrors<OnboardingFieldName> = {};
  if (input.details) {
    const identity = validateClientIdentity({ ...toClientDetailsInput(client), ...input.details });
    if (identity.email) errors.email = identity.email;
    if (identity.website) errors.website = identity.website;
  }
  for (const [key, raw] of Object.entries(input.answers ?? {}) as [ContextFieldKey, string][]) {
    const value = raw.trim();
    if (!value) continue;
    if (value.length > ANSWER_MAX_LENGTH) errors[key] = `Keep this under ${ANSWER_MAX_LENGTH.toLocaleString("en")} characters.`;
    else if (BRIEF_FIELD[key].input === "url" && !isValidWebAddress(value)) errors[key] = "Enter a valid web address, like store.com.";
    else if (BRIEF_FIELD[key].input === "channels") {
      const { channels, unrecognized } = decodeSalesChannels(value);
      if (unrecognized.length) errors[key] = `Unknown sales channel: ${unrecognized.join(", ")}.`;
      else {
        try {
          encodeSalesChannels(channels);
        } catch (error) {
          errors[key] = (error as Error).message;
        }
      }
    }
  }
  const tooLong = (input.questions ?? []).find((q) => q.trim().length > QUESTION_MAX_LENGTH);
  if (tooLong) errors.questions = `Keep each question under ${QUESTION_MAX_LENGTH} characters.`;
  return errors;
}

/* -------------------------------------------------------------------------- */
/* Saving a step                                                              */
/* -------------------------------------------------------------------------- */

export interface OnboardingSave {
  client: Client;
  onboarding: Onboarding;
  /** What a repository has to write: the details row, these brief values, new questions, the onboarding. */
  detailsChanged: boolean;
  changedFields: ContextFieldKey[];
  addedItems: ContextItem[];
  onboardingChanged: boolean;
  events: ActivityEvent[];
}

/**
 * Applies one step: client details, answers, confirmations, skips and open
 * questions, then moves the onboarding to the next step. Atomic: it either
 * returns the whole result or throws without side effects.
 */
export function saveOnboardingStep(
  client: Client,
  onboarding: Onboarding,
  input: OnboardingStepInput,
  deps: DomainDeps,
): OnboardingSave {
  requirePerson(deps);
  if (onboarding.clientId !== client.id) throw new DomainError("This onboarding belongs to another client.");
  if (!ONBOARDING_STEPS.includes(input.nextStep)) throw new DomainError("Unknown onboarding step.");
  const errors = validateOnboardingStep(client, input);
  if (hasErrors(errors)) throw new DomainError(Object.values(errors)[0] ?? "Check the answers.");

  const now = deps.now();
  const at: DomainDeps = { ...deps, now: () => now };
  const events: ActivityEvent[] = [];
  let next = client;

  // 1. Details (contact, email, website, project type) live on the client itself.
  let detailsChanged = false;
  if (input.details) {
    const result = updateClientDetails(next, { ...toClientDetailsInput(next), ...input.details }, at);
    next = result.client;
    events.push(...result.events);
    detailsChanged = result.events.length > 0;
  }

  // 2. Answers. Unchanged values are left alone so their confidence and source survive.
  const confidence = input.answerConfidence ?? "observed";
  const changed = new Map<ContextFieldKey, "added" | "updated" | "cleared" | "confirmed">();
  let skipped = new Set(onboarding.skipped);
  for (const key of CONTEXT_FIELD_KEYS) {
    const raw = input.answers?.[key];
    if (raw === undefined) continue;
    const value = BRIEF_FIELD[key].input === "channels" ? normalizeChannelsValue(raw) : clean(raw);
    const current = next.context[key];
    if (value === current.value) continue;
    const result = setContextField(next, key, { value: value ?? "", confidence, source: ONBOARDING_SOURCE }, at);
    next = result.client;
    changed.set(key, !value ? "cleared" : current.value ? "updated" : "added");
    if (value) skipped.delete(key);
  }

  // 3. Confirmations: a person vouches for a value that is already recorded.
  for (const key of input.confirm ?? []) {
    const field = next.context[key];
    if (field.value === null || field.confidence === "confirmed" || changed.has(key)) continue;
    next = setContextField(next, key, { value: field.value, confidence: "confirmed" }, at).client;
    changed.set(key, "confirmed");
  }

  // 4. Skips: "not known yet" only applies to values that are still unknown.
  for (const key of input.skip ?? []) {
    if (next.context[key].value === null) skipped.add(key);
  }
  skipped = new Set(CONTEXT_FIELD_KEYS.filter((key) => skipped.has(key)));

  // 5. Open questions, ignoring ones already on the list.
  const addedItems: ContextItem[] = [];
  for (const text of input.questions ?? []) {
    const cleaned = clean(text);
    if (!cleaned) continue;
    const exists = next.contextItems.some((i) => i.kind === "question" && i.text.toLocaleLowerCase() === cleaned.toLocaleLowerCase());
    if (exists) continue;
    const result = addContextItem(next, { kind: "question", text: cleaned }, at);
    next = result.client;
    addedItems.push(result.item);
  }

  const summary = describeBriefChanges(changed, addedItems.length);
  if (summary) events.push(clientEvent(client.id, "client.context_updated", summary, at, now));

  const nextOnboarding: Onboarding = {
    ...onboarding,
    status: onboarding.status === "ready_for_review" ? "ready_for_review" : "in_progress",
    currentStep: input.nextStep,
    skipped: [...skipped],
  };
  const onboardingChanged =
    nextOnboarding.status !== onboarding.status ||
    nextOnboarding.currentStep !== onboarding.currentStep ||
    nextOnboarding.skipped.join() !== onboarding.skipped.join();

  return {
    client: next,
    onboarding: onboardingChanged ? { ...nextOnboarding, updatedAt: now } : onboarding,
    detailsChanged,
    changedFields: [...changed.keys()],
    addedItems,
    onboardingChanged,
    events,
  };
}

function normalizeChannelsValue(raw: string): string | null {
  const { channels, unrecognized } = decodeSalesChannels(raw);
  if (unrecognized.length) throw new DomainError(`Unknown sales channel: ${unrecognized.join(", ")}.`);
  try {
    return channels.length ? encodeSalesChannels(channels) : null;
  } catch (error) {
    if (error instanceof BriefError) throw new DomainError(error.message);
    throw error;
  }
}

/** "Onboarding: added industry and goal; confirmed budget; 1 open question". */
function describeBriefChanges(changed: Map<ContextFieldKey, string>, questions: number): string | null {
  const groups = new Map<string, string[]>();
  for (const [key, verb] of changed) groups.set(verb, [...(groups.get(verb) ?? []), lowerFirst(CONTEXT_FIELD_LABELS[key])]);
  const parts = ["added", "updated", "confirmed", "cleared"].flatMap((verb) => (groups.has(verb) ? [`${verb} ${formatList(groups.get(verb)!)}`] : []));
  if (questions) parts.push(`added ${questions === 1 ? "1 open question" : `${questions} open questions`}`);
  if (!parts.length) return null;
  const text = `Onboarding: ${parts.join("; ")}`;
  return text.length > 480 ? `${text.slice(0, 479)}…` : text;
}

/** "Store URL" → "store URL": lowercase for a sentence, acronyms kept. */
function lowerFirst(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/* -------------------------------------------------------------------------- */
/* Finishing                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Marks the guided pass finished. Partial briefs are allowed: unknown values
 * stay unknown and are listed as gaps, never filled in.
 */
export function completeOnboarding(
  client: Client,
  onboarding: Onboarding,
  deps: DomainDeps,
): { onboarding: Onboarding; events: ActivityEvent[] } {
  requirePerson(deps);
  if (onboarding.status === "ready_for_review") return { onboarding, events: [] };
  const now = deps.now();
  const gaps = getBriefGaps(client, onboarding);
  const open = gaps.missing.length + gaps.skipped.length;
  return {
    onboarding: { ...onboarding, status: "ready_for_review", currentStep: "review", completedAt: now, updatedAt: now },
    events: [
      clientEvent(
        client.id,
        "onboarding.ready_for_review",
        open ? `Brief ready for review, ${open === 1 ? "1 detail" : `${open} details`} still unknown` : "Brief ready for review",
        deps,
        now,
      ),
    ],
  };
}

/* -------------------------------------------------------------------------- */
/* Progress                                                                   */
/* -------------------------------------------------------------------------- */

/** How much of the relevant brief is answered, for a short progress line. */
export function briefProgress(client: Client): { answered: number; total: number } {
  const conditions = briefConditions(client);
  const relevant = CONTEXT_FIELD_KEYS.filter((key) => BRIEF_FIELD[key].appliesTo?.(conditions) ?? true);
  return { answered: relevant.filter((key) => client.context[key].value !== null).length, total: relevant.length };
}
