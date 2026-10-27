"use client";

import { ArrowRight, Check, History, ListChecks, Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { ChannelPicker } from "@/components/onboarding/channel-picker";
import { useCanEdit } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button, ButtonLink } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Section, Surface } from "@/components/ui/surface";
import { BRIEF_FIELD, briefConditions, fieldApplies } from "@/lib/domain/brief";
import {
  actorLabel,
  CONFIDENCE_DESCRIPTIONS,
  CONFIDENCE_LABELS,
  CONTEXT_FIELD_LABELS,
  ONBOARDING_STEP_LABELS,
  SOURCE_TYPE_LABELS,
} from "@/lib/domain/labels";
import { stepIndex } from "@/lib/domain/onboarding";
import {
  CONTEXT_FIELD_KEYS,
  ONBOARDING_STEPS,
  type Client,
  type ContextField,
  type ContextFieldInput,
  type ContextFieldKey,
  type Onboarding,
} from "@/lib/domain/types";
import { formatContextValue, formatDate } from "@/lib/format";
import { ConfidenceTag } from "./status";

const EDITABLE_CONFIDENCES: ContextFieldInput["confidence"][] = ["observed", "proposed", "confirmed"];

const GROUPS = ONBOARDING_STEPS.filter((step) => step !== "review");
const UNKNOWN_CHIPS_SHOWN = 6;

/**
 * The client brief: what we know, how sure we are, and where it came from,
 * grouped like onboarding. It is the same data onboarding writes, so editing
 * here and answering there never disagree. Only a person can confirm a value.
 */
export function BriefSection({ client, onboarding }: { client: Client; onboarding: Onboarding | undefined }) {
  const [editing, setEditing] = useState<ContextFieldKey | null>(null);
  const [showAllUnknown, setShowAllUnknown] = useState(false);
  const canEdit = useCanEdit();
  const conditions = briefConditions(client);
  const known = CONTEXT_FIELD_KEYS.filter((key) => client.context[key].value !== null);
  // Unknown values that matter for this kind of project. The rest stay out of the way.
  const unknown = CONTEXT_FIELD_KEYS.filter((key) => client.context[key].value === null && fieldApplies(key, conditions) && key !== editing);
  const shownUnknown = showAllUnknown ? unknown : unknown.slice(0, UNKNOWN_CHIPS_SHOWN);
  const questions = client.contextItems.filter((item) => item.confidence !== "superseded");

  return (
    <Section id="brief" title="Brief" action={<ConfidenceHelp />}>
      <OnboardingStatus client={client} onboarding={onboarding} />
      <Surface>
        {known.length === 0 && editing === null ? (
          <p className="px-5 pt-4 text-[13.5px] text-ink-muted">Nothing recorded yet. Add what you know; it can stay unconfirmed until the client agrees.</p>
        ) : null}
        {GROUPS.map((group) => {
          const keys = known.filter((key) => BRIEF_FIELD[key].step === group);
          const editingHere = editing && BRIEF_FIELD[editing].step === group && client.context[editing].value === null;
          if (keys.length === 0 && !editingHere) return null;
          return (
            <div key={group} className="border-t border-line first:border-t-0">
              <p className="px-5 pt-3.5 text-[12px] font-medium text-ink-subtle">{ONBOARDING_STEP_LABELS[group]}</p>
              <ul className="divide-y divide-line">
                {keys.map((key) =>
                  editing === key ? (
                    <li key={key} id={`brief-${key}`} className="scroll-mt-24 px-5 py-4">
                      <FieldEditor client={client} fieldKey={key} onDone={() => setEditing(null)} />
                    </li>
                  ) : (
                    <KnownField key={key} client={client} fieldKey={key} onEdit={() => setEditing(key)} />
                  ),
                )}
                {editingHere ? (
                  <li id={`brief-${editing}`} className="px-5 py-4">
                    <FieldEditor client={client} fieldKey={editing} onDone={() => setEditing(null)} />
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}

        {canEdit && unknown.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
            <span className="mr-1 text-[12.5px] text-ink-subtle">Not known yet</span>
            {shownUnknown.map((key) => (
              <Button key={key} size="xs" variant="secondary" onClick={() => setEditing(key)} id={editing ? undefined : `brief-${key}`}>
                <Plus aria-hidden />
                {CONTEXT_FIELD_LABELS[key]}
              </Button>
            ))}
            {unknown.length > UNKNOWN_CHIPS_SHOWN ? (
              <button type="button" onClick={() => setShowAllUnknown((v) => !v)} aria-expanded={showAllUnknown} className="rounded-sm text-[12.5px] text-ink-subtle hover:text-ink">
                {showAllUnknown ? "Show fewer" : `${unknown.length - UNKNOWN_CHIPS_SHOWN} more`}
              </button>
            ) : null}
          </div>
        ) : null}

        {questions.length > 0 ? (
          <div className="border-t border-line px-5 py-4">
            <p className="mb-2 text-[12.5px] text-ink-subtle">Open questions and assumptions</p>
            <ul className="flex flex-col gap-2">
              {questions.map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-3 text-[13.5px] leading-snug text-ink">
                  <span>
                    <span className="text-ink-subtle">{item.kind === "question" ? "Question: " : "Assumption: "}</span>
                    {item.text}
                  </span>
                  {item.kind === "assumption" ? <ConfidenceTag confidence={item.confidence} /> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Surface>
    </Section>
  );
}

/** Where guided onboarding stands, with the one action that moves it on. */
function OnboardingStatus({ client, onboarding }: { client: Client; onboarding: Onboarding | undefined }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const { run, pending } = useStudioAction();
  const href = `/clients/${encodeURIComponent(client.id)}/onboarding`;

  async function start() {
    const started = await run((r) => r.startOnboarding(client.id), "Onboarding could not start.");
    if (started) router.push(href);
  }

  if (!onboarding) {
    if (!canEdit) return null;
    return (
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-dashed border-line-strong px-4 py-3">
        <p className="text-[13.5px] text-ink-muted">Fill in the brief step by step. Only questions that fit the project are asked.</p>
        <Button size="sm" onClick={start} disabled={pending}>
          <ListChecks aria-hidden />
          {pending ? "Starting…" : "Start onboarding"}
        </Button>
      </div>
    );
  }

  if (onboarding.status === "ready_for_review") {
    return (
      <p className="mb-3 flex flex-wrap items-center gap-x-2 text-[12.5px] text-ink-subtle">
        Onboarding finished {formatDate(onboarding.completedAt ?? onboarding.updatedAt)}. Edit any value below, or
        <a href={href} className="rounded-sm text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink">
          go through it again
        </a>
      </p>
    );
  }

  const index = stepIndex(onboarding.currentStep);
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line bg-accent-soft px-4 py-3">
      <p className="text-[13.5px] text-ink">
        Onboarding {onboarding.status === "draft" ? "started" : "in progress"}
        <span className="text-ink-muted">
          {" "}
          · step {index + 1} of {ONBOARDING_STEPS.length}, {ONBOARDING_STEP_LABELS[onboarding.currentStep]}
        </span>
      </p>
      <ButtonLink href={href} size="sm" variant="primary">
        Continue onboarding
        <ArrowRight aria-hidden />
      </ButtonLink>
    </div>
  );
}

function KnownField({ client, fieldKey, onEdit }: { client: Client; fieldKey: ContextFieldKey; onEdit: () => void }) {
  const field = client.context[fieldKey];
  const { run, pending, canEdit } = useStudioAction();
  const confirm = () =>
    run((repository) => repository.setContextField(client.id, fieldKey, { value: field.value ?? "", confidence: "confirmed" }));

  return (
    <li id={`brief-${fieldKey}`} className="group grid scroll-mt-24 gap-x-6 gap-y-1 px-5 py-4 target:bg-accent-soft sm:grid-cols-[110px_minmax(0,1fr)]">
      <p className="text-[13px] text-ink-subtle">{CONTEXT_FIELD_LABELS[fieldKey]}</p>
      <div className="min-w-0">
        <p className="text-[14px] leading-relaxed text-ink">{formatContextValue(field.value ?? "")}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] text-ink-subtle">
          <ConfidenceTag confidence={field.confidence} />
          <Provenance field={field} />
          <span className="ml-auto flex items-center gap-1" hidden={!canEdit}>
            {field.confidence !== "confirmed" ? (
              <Button size="xs" variant="secondary" onClick={confirm} disabled={pending} title="Mark as confirmed by the client or an authorized team member">
                <Check aria-hidden />
                Confirm
              </Button>
            ) : null}
            <Button size="xs" variant="ghost" onClick={onEdit} aria-label={`Edit ${CONTEXT_FIELD_LABELS[fieldKey].toLowerCase()}`}>
              <Pencil aria-hidden />
              Edit
            </Button>
          </span>
        </div>
        {field.note ? <p className="mt-1.5 text-[12.5px] text-ink-muted">{field.note}</p> : null}
        <FieldHistory field={field} />
      </div>
    </li>
  );
}

function Provenance({ field }: { field: ContextField }) {
  const parts = [
    field.source ? (field.source.label ?? SOURCE_TYPE_LABELS[field.source.type]) : null,
    field.recordedBy && field.confidence === "proposed" ? `by ${actorLabel(field.recordedBy)}` : null,
    field.confidence === "confirmed" && field.confirmedBy ? `confirmed by ${actorLabel(field.confirmedBy)}` : null,
  ].filter(Boolean);
  return (
    <span>
      {parts.length ? `${parts.join(" ")} · ` : ""}
      <RelativeTime iso={field.updatedAt} />
    </span>
  );
}

function FieldHistory({ field }: { field: ContextField }) {
  if (!field.history?.length) return null;
  return (
    <details className="mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-ink-subtle hover:text-ink-muted">
        <History aria-hidden className="size-3.5" />
        {field.history.length === 1 ? "1 earlier value" : `${field.history.length} earlier values`}
      </summary>
      <ul className="mt-2 flex flex-col gap-1.5 border-l border-line pl-3">
        {field.history.map((entry, index) => (
          <li key={index} className="text-[12.5px] text-ink-subtle">
            <span className="line-through decoration-ink-subtle/50">{formatContextValue(entry.value)}</span>
            <span> · was {CONFIDENCE_LABELS[entry.confidence].toLowerCase()}, superseded {formatDate(entry.supersededAt)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function FieldEditor({ client, fieldKey, onDone }: { client: Client; fieldKey: ContextFieldKey; onDone: () => void }) {
  const field = client.context[fieldKey];
  const formId = useId();
  const [value, setValue] = useState(field.value ?? "");
  const [confidence, setConfidence] = useState<ContextFieldInput["confidence"]>(
    field.confidence === "confirmed" || field.confidence === "proposed" ? field.confidence : "observed",
  );
  const { run, pending } = useStudioAction();

  async function save(event: FormEvent) {
    event.preventDefault();
    const saved = await run((repository) => repository.setContextField(client.id, fieldKey, { value, confidence }));
    if (saved) onDone();
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3" aria-label={`Edit ${CONTEXT_FIELD_LABELS[fieldKey].toLowerCase()}`}>
      <label id={`${formId}-label`} htmlFor={`${formId}-value`} className="text-[13px] font-medium text-ink">
        {CONTEXT_FIELD_LABELS[fieldKey]}
      </label>
      {BRIEF_FIELD[fieldKey].input === "channels" ? (
        <ChannelPicker value={value} onChange={setValue} labelledBy={`${formId}-label`} />
      ) : (
        <textarea
          id={`${formId}-value`}
          autoFocus
          rows={2}
          value={value}
          placeholder={BRIEF_FIELD[fieldKey].placeholder?.(briefConditions(client))}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onDone();
          }}
          className="w-full resize-y rounded-[var(--radius-control)] border border-control bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-subtle hover:border-accent focus:border-focus focus:ring-2 focus:ring-focus/15 focus:outline-none"
        />
      )}
      <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2" disabled={!value.trim()}>
        <legend className="sr-only">How certain is this?</legend>
        {EDITABLE_CONFIDENCES.map((option) => (
          <label key={option} className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted has-disabled:opacity-50" title={CONFIDENCE_DESCRIPTIONS[option]}>
            <input
              type="radio"
              name={`${formId}-confidence`}
              value={option}
              checked={confidence === option}
              onChange={() => setConfidence(option)}
              className="size-3.5 accent-[var(--color-primary)]"
            />
            {CONFIDENCE_LABELS[option]}
          </label>
        ))}
      </fieldset>
      <p className="text-[12px] text-ink-subtle">
        {value.trim()
          ? CONFIDENCE_DESCRIPTIONS[confidence]
          : field.value
            ? "Saving an empty value marks this as unknown. The current value is kept in history."
            : "Enter a value to save it."}
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={pending || (!value.trim() && !field.value)}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ConfidenceHelp() {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded-sm text-[12.5px] text-ink-subtle hover:text-ink">How certainty works</summary>
      <div className="absolute right-0 z-10 mt-2 w-[min(340px,calc(100vw-2rem))] rounded-[var(--radius-surface)] border border-line bg-surface p-4 shadow-[var(--shadow-overlay)]">
        <dl className="flex flex-col gap-2.5">
          {(["confirmed", "observed", "proposed", "unknown", "superseded"] as const).map((confidence) => (
            <div key={confidence} className="flex items-start gap-2.5 text-[12.5px]">
              <dt className="w-[86px] shrink-0">
                <ConfidenceTag confidence={confidence} />
              </dt>
              <dd className="text-ink-muted">{CONFIDENCE_DESCRIPTIONS[confidence]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 border-t border-line pt-3 text-[12px] text-ink-subtle">AI agents will only ever propose values. A person decides what is confirmed.</p>
      </div>
    </details>
  );
}
