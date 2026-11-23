"use client";

import { Field, Select, TextInput } from "@/components/ui/field";
import { StatusLabel } from "@/components/ui/status";
import {
  SERVICES_FEEL_LABELS,
  SERVICES_FEELS,
  SERVICES_HERO_LABELS,
  SERVICES_HEROES,
  SERVICES_MOTION_LABELS,
  SERVICES_MOTIONS,
  SERVICES_SIGNATURE_LABELS,
  SERVICES_SIGNATURES,
} from "@/lib/site-spec/catalog";
import type { LocalizedText, SiteSpec } from "@/lib/site-spec/schema";
import { signatureFor } from "@/lib/site-spec/to-services";
import { useEffect, useMemo, useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { lookAlikes, suggestion, type OtherDesign } from "@/lib/site-spec/uniqueness";
import type { SpecEditing } from "./site-spec-editor";

type Concept = NonNullable<SiteSpec["brand"]["concept"]>;

/**
 * The company design's concept: one idea, and the choices that make this
 * firm's site unlike others in the same direction. The signature part's
 * facts come from the AI draft with their sources; here a person chooses
 * which part to show, ticks the owner's consent and confirms each number.
 */
export function ConceptEditor({ spec, editing, projectId }: { spec: SiteSpec; editing: SpecEditing; projectId?: string }) {
  const { editable, change, personSource } = editing;
  const concept = spec.brand.concept ?? {};
  const locale = spec.locales.default;
  const say = (value: LocalizedText | undefined) => value?.[locale]?.trim() ?? "";
  const conceptChange = (edit: (c: Concept) => void) =>
    change((s) => {
      const next: Concept = { ...s.brand.concept };
      edit(next);
      s.brand.concept = next;
      s.brand.source = personSource();
    });
  const signatureChange = (edit: (s: NonNullable<SiteSpec["signature"]>) => void) =>
    change((s) => {
      if (!s.signature) return;
      edit(s.signature);
      s.signature.source = personSource();
    });
  // Every image in the spec counts here; the build checks that its file exists.
  const status = signatureFor(spec, locale, (id) => (id && spec.assets.some((a) => a.id === id) ? id : undefined));
  const data = spec.signature;

  return (
    <section className="flex flex-col gap-4 rounded-[var(--radius-control)] border border-line px-4 py-4" aria-labelledby="concept-heading" data-testid="concept">
      <div className="flex flex-col gap-1">
        <h3 id="concept-heading" className="text-[14px] font-medium text-ink">
          Concept
        </h3>
        <p className="text-[12.5px] text-ink-muted">What makes this site unlike others in the same direction. The AI draft proposes it from the client&apos;s material; change any part.</p>
      </div>
      <Field id="concept-idea" label="The idea, in one sentence">
        <TextInput
          id="concept-idea"
          value={concept.idea ?? ""}
          maxLength={240}
          disabled={!editable}
          placeholder="For example: the craft up close, and the workshop's 38 years as its signature"
          onChange={(e) => conceptChange((c) => void (e.target.value ? (c.idea = e.target.value) : delete c.idea))}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="concept-hero" label="First screen">
          <Select id="concept-hero" value={concept.hero ?? ""} disabled={!editable} onChange={(e) => conceptChange((c) => void (e.target.value ? (c.hero = e.target.value as Concept["hero"]) : delete c.hero))}>
            <option value="">The direction&apos;s own</option>
            {SERVICES_HEROES.map((v) => (
              <option key={v} value={v}>
                {SERVICES_HERO_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="concept-signature" label="Signature part">
          <Select id="concept-signature" value={concept.signature ?? ""} disabled={!editable} onChange={(e) => conceptChange((c) => void (e.target.value ? (c.signature = e.target.value as Concept["signature"]) : delete c.signature))}>
            <option value="">None</option>
            {SERVICES_SIGNATURES.map((v) => (
              <option key={v} value={v}>
                {SERVICES_SIGNATURE_LABELS[v]}
                {data?.[v] ? "" : " (no content yet)"}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="concept-feel" label="Photos">
          <Select id="concept-feel" value={concept.feel ?? ""} disabled={!editable} onChange={(e) => conceptChange((c) => void (e.target.value ? (c.feel = e.target.value as Concept["feel"]) : delete c.feel))}>
            <option value="">The direction&apos;s own</option>
            {SERVICES_FEELS.map((v) => (
              <option key={v} value={v}>
                {SERVICES_FEEL_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="concept-motion" label="Movement">
          <Select id="concept-motion" value={concept.motion ?? ""} disabled={!editable} onChange={(e) => conceptChange((c) => void (e.target.value ? (c.motion = e.target.value as Concept["motion"]) : delete c.motion))}>
            <option value="">Calm</option>
            {SERVICES_MOTIONS.filter((v) => v !== "calm").map((v) => (
              <option key={v} value={v}>
                {SERVICES_MOTION_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {concept.signature ? (
        <div className="flex flex-col gap-2 text-[13px]">
          {status.kind ? <StatusLabel tone="positive">Shown on the home page</StatusLabel> : <StatusLabel tone="caution">Not shown yet: {status.reason}</StatusLabel>}

          {concept.signature === "year" && data?.year ? (
            <div>
              <p className="text-ink">
                {data.year.year}: {say(data.year.heading)}
              </p>
              <ul className="list-disc pl-5 text-ink-muted">
                {data.year.events.map((e, i) => (
                  <li key={i}>
                    {e.when}: {say(e.text)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {concept.signature === "ownerLine" && data?.ownerLine ? (
            <div className="flex flex-col gap-1">
              <p className="text-ink">“{say(data.ownerLine.text)}” — {data.ownerLine.who}</p>
              <label className="flex items-center gap-2 text-ink">
                <input
                  type="checkbox"
                  checked={data.ownerLine.consent}
                  disabled={!editable}
                  onChange={(e) => signatureChange((s) => void (s.ownerLine && (s.ownerLine.consent = e.target.checked)))}
                />
                {data.ownerLine.who} agreed, in writing, to be quoted on the site
              </label>
            </div>
          ) : null}

          {concept.signature === "numbers" && data?.numbers ? (
            <ul className="flex flex-col gap-1">
              {data.numbers.items.map((item, i) => (
                <li key={i}>
                  <label className="flex items-center gap-2 text-ink">
                    <input
                      type="checkbox"
                      checked={item.confirmed}
                      disabled={!editable}
                      onChange={(e) => signatureChange((s) => void (s.numbers?.items[i] && (s.numbers.items[i].confirmed = e.target.checked)))}
                    />
                    <strong className="font-medium">{item.value}</strong> {say(item.text)}: the client confirmed it
                  </label>
                </li>
              ))}
            </ul>
          ) : null}

          {concept.signature === "area" && data?.area ? (
            <p className="text-ink-muted">
              {say(data.area.heading)}: {data.area.places.map((p) => p.name).join(", ")}
            </p>
          ) : null}

          {concept.signature === "season" && data?.season ? (
            <p className="text-ink-muted">
              {say(data.season.title)}: {say(data.season.text)} {say(data.season.price)}
            </p>
          ) : null}

          {concept.signature === "books" && data?.books ? (
            <ul className="list-disc pl-5 text-ink-muted">
              {data.books.items.map((b, i) => (
                <li key={i}>
                  {say(b.title)} ({b.year}), {say(b.detail)}
                </li>
              ))}
            </ul>
          ) : null}

          {concept.signature === "everyday" ? <p className="text-ink-muted">An ordinary day needs three to five of the client&apos;s own photos, each with a line. Add them in a later step.</p> : null}
        </div>
      ) : null}
      {projectId ? <LookAlikes brand={spec.brand} projectId={projectId} /> : null}
    </section>
  );
}

/**
 * Whether this site looks like another site from the studio: same direction and colours,
 * and how many of the concept's choices too. Read once; compared again as the brand changes.
 */
function LookAlikes({ brand, projectId }: { brand: SiteSpec["brand"]; projectId: string }) {
  const store = useStudioStore();
  const state = useStudio();
  const [designs, setDesigns] = useState<Omit<OtherDesign, "clientName">[] | null>(null);
  useEffect(() => {
    let active = true;
    store.read((r) => (r.listStudioDesigns ? r.listStudioDesigns() : Promise.resolve([]))).then(
      (list) => active && setDesigns(list),
      () => active && setDesigns([]),
    );
    return () => {
      active = false;
    };
  }, [store]);
  const names = useMemo(() => new Map(state.status === "ready" ? state.snapshot.clients.map((c) => [c.id, c.name]) : []), [state]);
  if (!designs) return null;
  const alike = lookAlikes(brand, designs.map((d) => ({ ...d, clientName: names.get(d.clientId) ?? "another client" })), projectId);
  if (!alike.length) return <StatusLabel tone="positive">Unlike the studio&apos;s other sites in direction and colours.</StatusLabel>;
  return (
    <ul className="flex flex-col gap-1.5 text-[13px]" aria-label="Sites this one looks like">
      {alike.slice(0, 3).map((likeness) => (
        <li key={likeness.other.projectId} className="flex flex-col gap-0.5">
          <StatusLabel tone={likeness.level === "same" ? "critical" : "caution"}>
            {likeness.level === "same" ? "Looks the same as" : "Close to"} {likeness.other.clientName}&apos;s site: same {likeness.shared.join(", ")}.
          </StatusLabel>
          <span className="pl-3 text-[12.5px] text-ink-muted">{suggestion(likeness)}</span>
        </li>
      ))}
    </ul>
  );
}
