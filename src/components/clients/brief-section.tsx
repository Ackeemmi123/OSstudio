"use client";

import { Check, History, Pencil, Plus } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Section, Surface } from "@/components/ui/surface";
import { actorLabel, CONFIDENCE_DESCRIPTIONS, CONFIDENCE_LABELS, CONTEXT_FIELD_LABELS, SOURCE_TYPE_LABELS } from "@/lib/domain/labels";
import { CONTEXT_FIELD_KEYS, type Client, type ContextField, type ContextFieldInput, type ContextFieldKey } from "@/lib/domain/types";
import { formatContextValue, formatDate } from "@/lib/format";
import { ConfidenceTag } from "./status";

const EDITABLE_CONFIDENCES: ContextFieldInput["confidence"][] = ["observed", "proposed", "confirmed"];
const PLACEHOLDERS: Record<ContextFieldKey, string> = {
  goal: "What does the client want to achieve?",
  requirements: "Pages, features, languages, integrations…",
  targetAudience: "Who is the website for?",
  budget: "An amount or a range",
  deadline: "A date (YYYY-MM-DD) or a timeframe",
  platform: "Current platform, systems that must stay, hosting…",
};

/**
 * The client brief: what we know, how sure we are, and where it came from.
 * Each value is edited on its own. Only a person can mark a value confirmed.
 */
export function BriefSection({ client }: { client: Client }) {
  const [editing, setEditing] = useState<ContextFieldKey | null>(null);
  const known = CONTEXT_FIELD_KEYS.filter((key) => client.context[key].value !== null);
  const unknown = CONTEXT_FIELD_KEYS.filter((key) => client.context[key].value === null);
  const questions = client.contextItems.filter((item) => item.confidence !== "superseded");

  return (
    <Section id="brief" title="Brief" action={<ConfidenceHelp />}>
      <Surface>
        {known.length === 0 && editing === null ? (
          <p className="px-5 pt-4 text-[13.5px] text-ink-muted">Nothing recorded yet. Add what you know; it can stay unconfirmed until the client agrees.</p>
        ) : null}
        <ul className="divide-y divide-line">
          {known.map((key) =>
            editing === key ? (
              <li key={key} id={`brief-${key}`} className="scroll-mt-24 px-5 py-4">
                <FieldEditor client={client} fieldKey={key} onDone={() => setEditing(null)} />
              </li>
            ) : (
              <KnownField key={key} client={client} fieldKey={key} onEdit={() => setEditing(key)} />
            ),
          )}
          {editing && unknown.includes(editing) ? (
            <li id={`brief-${editing}`} className="px-5 py-4">
              <FieldEditor client={client} fieldKey={editing} onDone={() => setEditing(null)} />
            </li>
          ) : null}
        </ul>

        {unknown.filter((key) => key !== editing).length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3.5">
            <span className="mr-1 text-[12.5px] text-ink-subtle">Not known yet</span>
            {unknown
              .filter((key) => key !== editing)
              .map((key) => (
                <Button key={key} size="xs" variant="secondary" onClick={() => setEditing(key)} id={editing ? undefined : `brief-${key}`}>
                  <Plus aria-hidden />
                  {CONTEXT_FIELD_LABELS[key]}
                </Button>
              ))}
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

function KnownField({ client, fieldKey, onEdit }: { client: Client; fieldKey: ContextFieldKey; onEdit: () => void }) {
  const field = client.context[fieldKey];
  const { run, pending } = useStudioAction();
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
          <span className="ml-auto flex items-center gap-1">
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
      <label htmlFor={`${formId}-value`} className="text-[13px] font-medium text-ink">
        {CONTEXT_FIELD_LABELS[fieldKey]}
      </label>
      <textarea
        id={`${formId}-value`}
        autoFocus
        rows={2}
        value={value}
        placeholder={PLACEHOLDERS[fieldKey]}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onDone();
        }}
        className="w-full resize-y rounded-[var(--radius-control)] border border-control bg-surface px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-subtle hover:border-accent focus:border-focus focus:ring-2 focus:ring-focus/15 focus:outline-none"
      />
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
