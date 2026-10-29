"use client";

import { Check, CircleHelp, Pencil, Sparkles, Undo2, X } from "lucide-react";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { ConfidenceTag } from "@/components/clients/status";
import { Button } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import type { BriefConditions, BriefFieldDefinition, QuestionState } from "@/lib/domain/brief";
import { actorLabel, SOURCE_TYPE_LABELS } from "@/lib/domain/labels";
import type { AgentProposal, ContextField } from "@/lib/domain/types";
import { formatContextValue } from "@/lib/format";
import { ChannelPicker } from "./channel-picker";

export interface QuestionDraft {
  /** The value in the input. Starts as the recorded value. */
  value: string;
  /** The input is shown (always for questions that are asked). */
  editing: boolean;
  /** The person confirmed the recorded value as it is. */
  confirming: boolean;
  /** The person said this is not known yet. */
  skipping: boolean;
}

/**
 * One onboarding question. What it shows depends on what is already known:
 * - unknown: the question, with "Not known yet";
 * - observed or proposed: the recorded value and where it came from, to confirm or correct;
 * - confirmed: the value, quietly, with "Change";
 * - skipped earlier: a short note, with "Answer now".
 */
export function QuestionField({
  id,
  definition,
  conditions,
  field,
  state,
  draft,
  error,
  proposals,
  ask = [],
  missingInMaterial = false,
  disabled,
  onChange,
}: {
  id: string;
  definition: BriefFieldDefinition;
  conditions: BriefConditions;
  field: ContextField;
  state: QuestionState;
  draft: QuestionDraft;
  error?: string;
  proposals: AgentProposal[];
  /** Questions the intake analysis suggests asking the client about this field. */
  ask?: { question: string; queued: boolean; onAsk: () => void }[];
  /** The intake analysis found nothing about this field in the material. */
  missingInMaterial?: boolean;
  disabled?: boolean;
  onChange: (next: Partial<QuestionDraft>) => void;
}) {
  const labelId = `${id}-label`;
  const hint = definition.hint?.(conditions);
  const showInput = draft.editing || state === "ask";
  const describedBy = [error ? `${id}-error` : null, hint && showInput ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2 py-5 first:pt-0 last:pb-0" data-question={definition.key}>
      <div className="flex items-baseline justify-between gap-3">
        <label id={labelId} htmlFor={definition.input === "channels" ? undefined : id} className="text-[14px] font-medium text-ink">
          {definition.question(conditions)}
        </label>
        {state === "ask" && !draft.skipping ? (
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ skipping: true, value: "" })}
            className="shrink-0 rounded-sm text-[12.5px] text-ink-subtle hover:text-ink"
          >
            Not known yet
          </button>
        ) : null}
      </div>

      {proposals.map((proposal) => (
        <ProposalRow key={proposal.id} proposal={proposal} />
      ))}

      {(state === "ask" || state === "skipped") && (ask.length || missingInMaterial) ? (
        <AskClient ask={ask} missingInMaterial={missingInMaterial} disabled={disabled} />
      ) : null}

      {state === "ask" && draft.skipping ? (
        <SkippedNote onUndo={() => onChange({ skipping: false })} disabled={disabled} label="Marked as not known yet. It stays on the list of open details." />
      ) : state === "skipped" && !draft.editing ? (
        <SkippedNote onUndo={() => onChange({ editing: true })} disabled={disabled} label="Not known yet." action="Answer now" />
      ) : (state === "verify" || state === "known") && !draft.editing ? (
        <RecordedValue field={field} state={state} draft={draft} onChange={onChange} disabled={disabled} />
      ) : null}

      {showInput && !(state === "ask" && draft.skipping) ? (
        <>
          {definition.input === "channels" ? (
            <ChannelPicker value={draft.value} onChange={(value) => onChange({ value })} labelledBy={labelId} disabled={disabled} />
          ) : definition.input === "longText" ? (
            <TextArea
              id={id}
              rows={2}
              value={draft.value}
              disabled={disabled}
              placeholder={definition.placeholder?.(conditions)}
              onChange={(event) => onChange({ value: event.target.value })}
              invalid={Boolean(error)}
              aria-describedby={describedBy}
              className="min-h-16"
            />
          ) : (
            <TextInput
              id={id}
              value={draft.value}
              disabled={disabled}
              inputMode={definition.input === "url" ? "url" : undefined}
              autoComplete="off"
              placeholder={definition.placeholder?.(conditions)}
              onChange={(event) => onChange({ value: event.target.value })}
              invalid={Boolean(error)}
              aria-describedby={describedBy}
            />
          )}
          {error ? (
            <p id={`${id}-error`} className="text-[12px] text-critical">
              {error}
            </p>
          ) : hint ? (
            <p id={`${id}-hint`} className="text-[12px] text-ink-subtle">
              {hint}
            </p>
          ) : null}
          {draft.editing && state !== "ask" ? (
            <button
              type="button"
              onClick={() => onChange({ editing: false, value: field.value ?? "" })}
              className="inline-flex w-fit items-center gap-1 rounded-sm text-[12.5px] text-ink-subtle hover:text-ink"
            >
              <Undo2 aria-hidden className="size-3.5" />
              Keep the recorded value
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function RecordedValue({
  field,
  state,
  draft,
  onChange,
  disabled,
}: {
  field: ContextField;
  state: QuestionState;
  draft: QuestionDraft;
  onChange: (next: Partial<QuestionDraft>) => void;
  disabled?: boolean;
}) {
  const source = field.source ? (field.source.label ?? SOURCE_TYPE_LABELS[field.source.type]) : null;
  const by = field.recordedBy && field.confidence === "proposed" ? `by ${actorLabel(field.recordedBy)}` : null;
  return (
    <div className={cn("rounded-[var(--radius-control)] border px-3.5 py-3", state === "verify" ? "border-line-strong bg-surface-muted" : "border-line")}>
      <p className="text-[14px] leading-relaxed whitespace-pre-wrap text-ink">{formatContextValue(field.value ?? "")}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-ink-subtle">
        {draft.confirming ? <ConfidenceTag confidence="confirmed" /> : <ConfidenceTag confidence={field.confidence} />}
        {source || by ? <span>{[source, by].filter(Boolean).join(" ")}</span> : null}
        {draft.confirming ? <span className="text-ink-muted">Will be confirmed when you continue</span> : null}
        <span className="ml-auto flex items-center gap-1">
          {state === "verify" ? (
            draft.confirming ? (
              <Button size="xs" variant="ghost" onClick={() => onChange({ confirming: false })} disabled={disabled}>
                <X aria-hidden />
                Undo
              </Button>
            ) : (
              <Button size="xs" variant="secondary" onClick={() => onChange({ confirming: true })} disabled={disabled} title="The client or an authorized team member confirmed this">
                <Check aria-hidden />
                Confirm
              </Button>
            )
          ) : null}
          <Button size="xs" variant="ghost" onClick={() => onChange({ editing: true, confirming: false })} disabled={disabled}>
            <Pencil aria-hidden />
            {state === "verify" ? "Correct" : "Change"}
          </Button>
        </span>
      </div>
    </div>
  );
}

function SkippedNote({ label, action = "Undo", onUndo, disabled }: { label: string; action?: string; onUndo: () => void; disabled?: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-subtle">
      <CircleHelp aria-hidden className="size-3.5" />
      {label}
      <button type="button" onClick={onUndo} disabled={disabled} className="rounded-sm text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
        {action}
      </button>
    </p>
  );
}

/** What the intake analysis says is not in the material, and what it suggests asking. Nothing is added until a person chooses to. */
function AskClient({ ask, missingInMaterial, disabled }: { ask: { question: string; queued: boolean; onAsk: () => void }[]; missingInMaterial: boolean; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-1.5 text-[12.5px] text-ink-muted" data-testid="ask-client">
      {missingInMaterial ? <p>Intake analysis found nothing about this in the material.</p> : null}
      {ask.map((item) => (
        <div key={item.question} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p>
            <span className="text-ink-subtle">Suggested question for the client: </span>
            <span className="text-ink">{item.question}</span>
          </p>
          {item.queued ? (
            <span className="text-ink-subtle">Added to open questions when you continue</span>
          ) : (
            <button type="button" disabled={disabled} onClick={item.onAsk} className="inline-flex items-center gap-1 rounded-sm text-ink-subtle hover:text-ink disabled:opacity-50">
              <CircleHelp aria-hidden className="size-3.5" />
              Ask the client
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** A value the intake agent found in source material. Nothing changes until a person accepts it. */
function ProposalRow({ proposal }: { proposal: AgentProposal }) {
  const { run, pending } = useStudioAction();
  const [evidence] = proposal.evidence;
  return (
    <div className="rounded-[var(--radius-control)] border border-caution/30 bg-caution/[0.04] px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-caution">
        <Sparkles aria-hidden className="size-3.5" />
        Suggested by intake analysis
      </p>
      <p className="mt-1 text-[14px] text-ink">{proposal.value}</p>
      {evidence ? (
        <p className="mt-1 text-[12.5px] text-ink-muted">
          “{evidence.quote}” <span className="text-ink-subtle">· {evidence.sourceLabel}</span>
        </p>
      ) : null}
      {proposal.note ? <p className="mt-1 text-[12.5px] text-ink-subtle">{proposal.note}</p> : null}
      <div className="mt-2 flex gap-1.5">
        <Button
          size="xs"
          variant="secondary"
          disabled={pending}
          onClick={() => run((r) => r.reviewProposal(proposal.id, { action: "accept", confidence: "observed" }), "The suggestion was not accepted.")}
        >
          <Check aria-hidden />
          Use as observed
        </Button>
        <Button size="xs" variant="ghost" disabled={pending} onClick={() => run((r) => r.reviewProposal(proposal.id, { action: "dismiss" }), "The suggestion was not dismissed.")}>
          Dismiss
        </Button>
      </div>
    </div>
  );
}
