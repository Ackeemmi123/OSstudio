"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import { applySiteDraft, takeEverything } from "@/lib/agents/site-draft-apply";
import type { DraftRef, SiteDraftResult } from "@/lib/agents/site-draft";
import { DESIGN_SYSTEM_LABELS, SECTION_LABELS, SERVICES_FEEL_LABELS, SERVICES_HERO_LABELS, SERVICES_MOTION_LABELS, SERVICES_SIGNATURE_LABELS } from "@/lib/site-spec/catalog";
import { styleName } from "./style-comparison";
import type { SiteSpecSection } from "@/lib/site-spec/schema";
import type { SpecEditing } from "./site-spec-editor";

const first = (value: unknown): string => (value && typeof value === "object" ? (Object.values(value as Record<string, string>).find(Boolean) ?? "") : typeof value === "string" ? value : "");

/** One proposed text, with the line of material it comes from beside it. */
function Proposed({ label, text, sources }: { label: string; text: string; sources: DraftRef[] | "generic" | undefined }) {
  if (!text) return null;
  return (
    <div className="grid gap-x-4 gap-y-1 border-t border-line/60 py-2 first:border-t-0 md:grid-cols-2">
      <div>
        <p className="text-[11px] tracking-[0.04em] text-ink-subtle uppercase">{label}</p>
        <p className="text-[13px] whitespace-pre-wrap text-ink">{text}</p>
      </div>
      <div className="text-[12px] text-ink-muted">
        {sources === "generic" ? (
          <p className="text-ink-subtle">Generic label, states no fact.</p>
        ) : sources?.length ? (
          sources.map((ref, i) => (
            <p key={i} className="mb-1">
              <span className="text-ink-subtle">
                {ref.sourceLabel}
                {ref.page ? `, page ${ref.page}` : ""}
                {ref.checked ? "" : " · not checked automatically"}:{" "}
              </span>
              <q className="italic">{ref.quote}</q>
            </p>
          ))
        ) : (
          <p className="text-ink-subtle">No source recorded.</p>
        )}
      </div>
    </div>
  );
}

const FIELD_ORDER = ["title", "name", "question", "role", "author", "price", "body", "answer", "quote"];

function sectionTexts(section: SiteSpecSection, path: string, provenance: SiteDraftResult["provenance"]) {
  const out: { label: string; text: string; sources: DraftRef[] | "generic" | undefined }[] = [];
  for (const key of ["eyebrow", "heading", "subheading", "body"] as const) {
    const text = first((section as Record<string, unknown>)[key]);
    if (text) out.push({ label: key, text, sources: provenance[`${path}.${key}`] });
  }
  if ("button" in section) out.push({ label: "button", text: first(section.button.label), sources: provenance[`${path}.button.label`] });
  if ("buttons" in section) for (const b of section.buttons) out.push({ label: "button", text: first(b.label), sources: provenance[`${path}.button.label`] });
  if ("items" in section) {
    for (const item of section.items as { id: string }[]) {
      const at = `${path}.items.${Number(item.id.slice(5)) - 1}`;
      // Stored drafts come back from the database with their keys reordered, so show them in reading order.
      const fields = Object.entries(item)
        .filter(([key]) => key !== "id" && key !== "source")
        .sort(([a], [b]) => FIELD_ORDER.indexOf(a) - FIELD_ORDER.indexOf(b));
      for (const [key, value] of fields) {
        const text = first(value);
        const field = key === "name" || key === "question" ? "title" : key === "answer" || key === "quote" ? "body" : key === "role" || key === "author" || key === "price" ? "extra" : key;
        const sources = provenance[`${at}.${field}`] ?? (field === "body" ? provenance[`${at}.extra`] : undefined);
        if (text) out.push({ label: `item · ${key}`, text, sources });
      }
    }
  }
  return out;
}

/**
 * The draft beside the material: every proposed text with the quote it
 * rests on. The person ticks what to take; taking it accepts it, and the
 * pages, texts and form in the spec are replaced by the chosen sections.
 */
export function SiteDraftReview({ result, editing, onDone }: { result: SiteDraftResult; editing: SpecEditing; onDone: () => void }) {
  const toast = useToast();
  const everything = useMemo(() => takeEverything(result), [result]);
  const [sections, setSections] = useState<Set<string>>(() => new Set(everything.sections));
  const [strategy, setStrategy] = useState(true);
  const [brand, setBrand] = useState(true);
  const spec = result.spec;
  const total = everything.sections.size;

  function toggle(id: string) {
    setSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function take() {
    if (!window.confirm("The pages, texts and contact form in this spec are replaced by the sections you chose. Images and other settings stay. Continue?")) return;
    try {
      const by = editing.personSource();
      const name = by.kind === "person" ? by.by : "Studio member";
      editing.change((draft) => void Object.assign(draft, applySiteDraft(draft, result, { sections, strategy, brand }, name)));
      toast.success("The draft is in the spec. Check it, then build the site from the preview.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The draft could not be taken.");
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="site-draft-review">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant="ghost" onClick={() => setSections(new Set(everything.sections))}>
          Choose all
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setSections(new Set())}>
          Choose none
        </Button>
        <span className="text-[12px] text-ink-subtle">
          {sections.size} of {total} sections chosen
        </span>
      </div>

      <fieldset className="rounded-[var(--radius-control)] border border-line p-3">
        <legend className="px-1 text-[12.5px] text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={strategy} onChange={(e) => setStrategy(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
            Strategy: goal, audiences and tone
          </label>
        </legend>
        <Proposed label="goal" text={spec.strategy.goal.text} sources={result.provenance["strategy.goal"]} />
        {spec.strategy.audiences.map((a, i) => (
          <Proposed key={a.id} label="audience" text={a.text} sources={result.provenance[`strategy.audiences.${i}`]} />
        ))}
        {spec.strategy.tone ? <p className="pt-2 text-[12px] text-ink-muted">Tone: {spec.strategy.tone}</p> : null}
      </fieldset>

      <fieldset className="rounded-[var(--radius-control)] border border-line p-3">
        <legend className="px-1 text-[12.5px] text-ink">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={brand} onChange={(e) => setBrand(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
            Design: {DESIGN_SYSTEM_LABELS[spec.brand.designSystem ?? "template"]}
            {spec.brand.source ? (
              <>
                , colour <span className="inline-block size-3 rounded-sm border border-line" style={{ background: spec.brand.colors.primary }} /> {spec.brand.colors.primary}
              </>
            ) : (
              ", no colours found in the material"
            )}
          </label>
        </legend>
        {spec.brand.styleProposals?.length ? (
          <div className="flex flex-col gap-1.5 pt-1">
            <p className="text-[12px] text-ink-muted">Proposed styles, the first is used until you choose another in the preview:</p>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-[12.5px] text-ink">
              {spec.brand.styleProposals.map((proposal, i) => (
                <li key={i}>
                  <span className="font-medium">{styleName(proposal)}</span>
                  <span className="text-ink-muted">: {proposal.reason}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {spec.brand.concept ? (
          <div className="flex flex-col gap-1 pt-1 text-[12.5px]">
            <p className="text-[12px] text-ink-muted">Proposed concept, taken with the design:</p>
            {spec.brand.concept.idea ? <p className="text-ink">{spec.brand.concept.idea}</p> : null}
            <p className="text-ink-muted">
              {[
                spec.brand.concept.hero ? SERVICES_HERO_LABELS[spec.brand.concept.hero] : null,
                spec.brand.concept.signature ? `signature: ${SERVICES_SIGNATURE_LABELS[spec.brand.concept.signature].toLowerCase()}` : "no signature part",
                spec.brand.concept.feel ? `photos ${SERVICES_FEEL_LABELS[spec.brand.concept.feel].toLowerCase()}` : null,
                spec.brand.concept.motion ? `${SERVICES_MOTION_LABELS[spec.brand.concept.motion].toLowerCase()} movement` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {spec.signature?.ownerLine || spec.signature?.numbers ? <p className="text-caution">The owner&apos;s consent and every number are ticked by a person in the brand settings before they show.</p> : null}
          </div>
        ) : null}
      </fieldset>

      {spec.pages.map((page, pi) => (
        <div key={page.id} className="flex flex-col gap-2">
          <p className="text-[13.5px] font-medium text-ink">
            {first(page.title) || page.id} <span className="font-normal text-ink-subtle">/{first(page.slug)}</span>
          </p>
          {page.sections.map((section, si) => {
            const path = `pages.${pi}.sections.${si}`;
            const chosen = sections.has(section.id);
            return (
              <div key={section.id} className={`rounded-[var(--radius-control)] border px-3 py-2 ${chosen ? "border-line-strong" : "border-line opacity-60"}`}>
                <label className="flex items-center gap-2 text-[12.5px] text-ink">
                  <input type="checkbox" checked={chosen} onChange={() => toggle(section.id)} className="size-4 accent-[var(--color-primary)]" />
                  {SECTION_LABELS[section.kind].label}
                  <Tag>{section.variant.replaceAll("_", " ")}</Tag>
                </label>
                <div className="mt-1">
                  {sectionTexts(section, path, result.provenance).map((t, i) => (
                    <Proposed key={i} {...t} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {result.dropped.length ? (
        <details className="text-[12px] text-ink-muted">
          <summary className="cursor-pointer">{result.dropped.length} texts left out because the material did not support them</summary>
          <ul className="mt-1 list-disc pl-5">
            {result.dropped.map((d) => (
              <li key={d.path}>{d.text}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={take} disabled={!editing.editable || sections.size === 0}>
          Take {sections.size} {sections.size === 1 ? "section" : "sections"} into the spec
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Close
        </Button>
      </div>
    </div>
  );
}
