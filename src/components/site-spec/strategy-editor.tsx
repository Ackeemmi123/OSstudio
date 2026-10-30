"use client";

import { Field, Select, TextArea, TextInput } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/status";
import { CONTEXT_FIELD_LABELS } from "@/lib/domain/labels";
import type { Client, ContextFieldKey } from "@/lib/domain/types";
import { freshId } from "@/lib/site-spec/edit";
import type { SiteSpec, SiteSpecSource } from "@/lib/site-spec/schema";
import { LocalizedInput } from "./localized-input";
import type { SpecEditing } from "./site-spec-editor";

/** Where a value came from, in a few words. */
export function SourceTag({ source }: { source?: SiteSpecSource }) {
  if (!source) return null;
  if (source.kind === "brief") return <Tag tone="positive" title="Copied from a confirmed brief value">From brief: {CONTEXT_FIELD_LABELS[source.field]}</Tag>;
  if (source.kind === "person") return <Tag title={`Written by ${source.by}`}>Written by {source.by}</Tag>;
  return <Tag tone={source.acceptedBy ? "info" : "caution"}>{source.acceptedBy ? `Suggestion accepted by ${source.acceptedBy}` : "Suggestion, not accepted"}</Tag>;
}

/** A confirmed brief value, ready to use as a source. Null when the value is not confirmed. */
export function briefSource(client: Client, field: ContextFieldKey): { value: string; source: SiteSpecSource } | null {
  const value = client.context[field];
  if (value.confidence !== "confirmed" || !value.value || !value.confirmedAt) return null;
  return { value: value.value, source: { kind: "brief", field, confirmedAt: value.confirmedAt } };
}

export function StrategyEditor({ spec, client, editing }: { spec: SiteSpec; client: Client; editing: SpecEditing }) {
  const { editable, change, personSource } = editing;
  const strategy = spec.strategy;
  const goal = briefSource(client, "goal");
  const audience = briefSource(client, "targetAudience");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Field id="spec-goal" label="Goal of the website" hint="What the website should achieve for the client. Not shown on the site.">
          <TextArea
            id="spec-goal"
            rows={2}
            value={strategy.goal.text}
            maxLength={1000}
            disabled={!editable}
            onChange={(e) => change((s) => void (s.strategy.goal = { text: e.target.value, source: personSource() }))}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <SourceTag source={strategy.goal.source} />
          {editable && goal && strategy.goal.source?.kind !== "brief" ? (
            <Button size="xs" variant="ghost" onClick={() => change((s) => void (s.strategy.goal = { text: goal.value.slice(0, 1000), source: goal.source }))}>
              Use the confirmed goal from the brief
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-[13px] font-medium text-ink">Audiences</p>
        {strategy.audiences.length === 0 ? <p className="text-[13px] text-ink-subtle">No audience yet.</p> : null}
        {strategy.audiences.map((entry, i) => (
          <div key={entry.id} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <TextInput
                aria-label={`Audience ${i + 1}`}
                value={entry.text}
                maxLength={300}
                disabled={!editable}
                onChange={(e) => change((s) => void (s.strategy.audiences[i] = { id: entry.id, text: e.target.value, source: personSource() }))}
              />
              {editable ? (
                <Button size="sm" variant="ghost" onClick={() => change((s) => void s.strategy.audiences.splice(i, 1))}>
                  Remove
                </Button>
              ) : null}
            </div>
            <SourceTag source={entry.source} />
          </div>
        ))}
        {editable ? (
          <div className="flex flex-wrap gap-2">
            {strategy.audiences.length < 5 ? (
              <Button size="xs" onClick={() => change((s) => void s.strategy.audiences.push({ id: freshId(s, "audience"), text: "", source: personSource() }))}>
                Add an audience
              </Button>
            ) : null}
            {audience && !strategy.audiences.some((a) => a.source?.kind === "brief" && a.source.field === "targetAudience") && strategy.audiences.length < 5 ? (
              <Button size="xs" variant="ghost" onClick={() => change((s) => void s.strategy.audiences.push({ id: freshId(s, "audience"), text: audience.value.slice(0, 300), source: audience.source }))}>
                Add the confirmed audience from the brief
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LocalizedInput
          label="Main call to action"
          value={strategy.primaryCta?.label ?? {}}
          locales={spec.locales.available}
          maxLength={40}
          disabled={!editable}
          onChange={(label) => change((s) => void (s.strategy.primaryCta = { label, targetPageId: s.strategy.primaryCta?.targetPageId ?? s.pages[0].id }))}
        />
        <Field id="spec-cta-target" label="It leads to">
          <Select
            id="spec-cta-target"
            value={strategy.primaryCta?.targetPageId ?? ""}
            disabled={!editable}
            onChange={(e) => change((s) => void (s.strategy.primaryCta = { label: s.strategy.primaryCta?.label ?? {}, targetPageId: e.target.value }))}
          >
            {!strategy.primaryCta ? <option value="">Choose a page</option> : null}
            {spec.pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.title[spec.locales.default] || page.id}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field id="spec-tone" label="Tone of voice" hint="For example: warm and plain-spoken.">
        <TextInput id="spec-tone" value={strategy.tone} maxLength={200} disabled={!editable} onChange={(e) => change((s) => void (s.strategy.tone = e.target.value))} />
      </Field>
    </div>
  );
}
