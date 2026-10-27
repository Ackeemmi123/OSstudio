/**
 * Source material, open questions, and the human review of agent proposals.
 *
 * Agents only ever create proposals. Accepting one is a person's decision and
 * goes through the same rules as editing the brief by hand: the replaced value
 * is kept in history, and only a person can mark a value confirmed.
 */
import { BriefError, normalizeBriefValue } from "./brief";
import { clean, clientEvent, DomainError, setContextField, toClientDetailsInput, updateClientDetails, type DomainDeps } from "./clients";
import { CONTEXT_FIELD_LABELS, PROPOSAL_TARGET_LABELS } from "./labels";
import {
  CONTEXT_FIELD_KEYS,
  SOURCE_CONTENT_MAX_LENGTH,
  type ActivityEvent,
  type AgentProposal,
  type Client,
  type ClientDetailsInput,
  type ContextFieldKey,
  type ContextItem,
  type NewContextItemInput,
  type NewSourceInput,
  type ProposalDecision,
  type ProposalTarget,
  type SourceDocument,
} from "./types";

export const SOURCE_LABEL_MAX_LENGTH = 160;
export const QUESTION_MAX_LENGTH = 1000;

export function isContextFieldKey(target: ProposalTarget): target is ContextFieldKey {
  return (CONTEXT_FIELD_KEYS as readonly string[]).includes(target);
}

export function buildSource(client: Client, input: NewSourceInput, deps: DomainDeps): { source: SourceDocument; event: ActivityEvent } {
  const label = clean(input.label);
  const content = input.content.trim();
  if (!label) throw new DomainError("Give the source a short name, for example “Intro email”.");
  if (label.length > SOURCE_LABEL_MAX_LENGTH) throw new DomainError(`Keep the name under ${SOURCE_LABEL_MAX_LENGTH} characters.`);
  if (!content) throw new DomainError("Paste the text of the source.");
  if (content.length > SOURCE_CONTENT_MAX_LENGTH) {
    throw new DomainError(`This source is too long (${content.length.toLocaleString("en")} characters). Split it into parts under ${SOURCE_CONTENT_MAX_LENGTH.toLocaleString("en")}.`);
  }
  const now = deps.now();
  const source: SourceDocument = { id: deps.createId(), clientId: client.id, type: input.type, label, content, receivedAt: now, addedBy: deps.actor };
  return { source, event: clientEvent(client.id, "source.received", `Added source material: ${label}`, deps, now) };
}

/** Adds an open question for the client, or an assumption the team is working with. */
export function addContextItem(
  client: Client,
  input: NewContextItemInput,
  deps: DomainDeps,
): { client: Client; item: ContextItem; event: ActivityEvent } {
  const text = clean(input.text);
  const what = input.kind === "question" ? "question" : "assumption";
  if (!text) throw new DomainError(`Enter the ${what}.`);
  if (text.length > QUESTION_MAX_LENGTH) throw new DomainError(`Keep the ${what} under ${QUESTION_MAX_LENGTH} characters.`);
  const duplicate = client.contextItems.some((item) => item.kind === input.kind && item.text.toLocaleLowerCase() === text.toLocaleLowerCase());
  if (duplicate) throw new DomainError(`This ${what} is already on the list.`);
  const now = deps.now();
  const item: ContextItem = { id: deps.createId(), kind: input.kind, text, confidence: input.kind === "question" ? "unknown" : "proposed", createdAt: now };
  return {
    client: { ...client, contextItems: [...client.contextItems, item], updatedAt: now },
    item,
    event: clientEvent(client.id, "client.context_updated", `Added open ${what}: ${truncate(text, 80)}`, deps, now),
  };
}

export interface ProposalReview {
  proposal: AgentProposal;
  /** The client after the change, when accepting changed it. */
  client: Client;
  /** Which part of the client changed, so a repository writes only that. */
  changed: { kind: "context"; key: ContextFieldKey } | { kind: "details" } | null;
  events: ActivityEvent[];
}

/**
 * A person accepts or dismisses an agent's proposal.
 *
 * Accepting records the value with the quoted evidence as its source and note.
 * "observed" means taken from the client's material but not yet confirmed;
 * "confirmed" means the person vouches for it.
 */
export function reviewProposal(
  client: Client,
  proposal: AgentProposal,
  decision: ProposalDecision,
  sources: SourceDocument[],
  deps: DomainDeps,
): ProposalReview {
  if (deps.actor.kind !== "human") throw new DomainError("Only a person can review a proposal.");
  if (proposal.status !== "pending") throw new DomainError("This proposal has already been reviewed.");
  if (proposal.clientId !== client.id) throw new DomainError("This proposal belongs to another client.");

  const now = deps.now();
  const label = PROPOSAL_TARGET_LABELS[proposal.target].toLowerCase();

  if (decision.action === "dismiss") {
    return {
      proposal: { ...proposal, status: "dismissed", reviewedBy: deps.actor, reviewedAt: now },
      client,
      changed: null,
      events: [clientEvent(client.id, "agent.proposal_dismissed", `Dismissed proposed ${label}`, deps, now)],
    };
  }

  const [first] = proposal.evidence;
  const sourceType = sources.find((source) => source.id === first?.sourceId)?.type ?? "other";
  let next = client;
  let changed: ProposalReview["changed"] = null;
  let events: ActivityEvent[] = [];

  if (isContextFieldKey(proposal.target)) {
    // A proposal enters the brief under the same rules as a typed answer.
    let value: string | null;
    try {
      value = normalizeBriefValue(proposal.target, proposal.value);
    } catch (error) {
      if (error instanceof BriefError) throw new DomainError(`${error.message} Dismiss this suggestion and type the value instead.`);
      throw error;
    }
    if (!value) throw new DomainError("This suggestion has no usable value. Dismiss it and type the value instead.");
    const result = setContextField(
      client,
      proposal.target,
      {
        value,
        confidence: decision.confidence,
        source: { type: sourceType, label: first ? `${first.sourceLabel} · intake analysis` : "Intake analysis" },
        note: [first ? `“${truncate(first.quote, 300)}”` : null, proposal.note].filter(Boolean).join(" · "),
      },
      deps,
    );
    next = result.client;
    events = result.events;
    if (events.length) changed = { kind: "context", key: proposal.target };
  } else {
    const details: ClientDetailsInput = { ...toClientDetailsInput(client), [DETAIL_FIELD[proposal.target]]: proposal.value };
    const result = updateClientDetails(client, details, deps);
    next = result.client;
    events = result.events;
    if (events.length) changed = { kind: "details" };
  }

  return {
    proposal: { ...proposal, status: "accepted", reviewConfidence: decision.confidence, reviewedBy: deps.actor, reviewedAt: now },
    client: next,
    changed,
    events: [
      ...events,
      clientEvent(
        client.id,
        "agent.proposal_accepted",
        `Accepted proposed ${label}${decision.confidence === "confirmed" && isContextFieldKey(proposal.target) ? " as confirmed" : ""}`,
        deps,
        now,
      ),
    ],
  };
}

const DETAIL_FIELD: Record<Exclude<ProposalTarget, ContextFieldKey>, keyof ClientDetailsInput> = {
  companyName: "name",
  contactPerson: "contactPerson",
  email: "email",
  website: "website",
};

/** The value a proposal would replace, or null when nothing is recorded. */
export function currentValueFor(client: Client, target: ProposalTarget): string | null {
  if (isContextFieldKey(target)) return client.context[target].value;
  const value = client[DETAIL_FIELD[target] as "name" | "contactPerson" | "email" | "website"];
  return value ?? null;
}

export function describeTarget(target: ProposalTarget): string {
  return isContextFieldKey(target) ? CONTEXT_FIELD_LABELS[target] : PROPOSAL_TARGET_LABELS[target];
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
