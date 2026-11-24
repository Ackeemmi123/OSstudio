"use client";

import { Field, Select } from "@/components/ui/field";
import { INDUSTRIES, INDUSTRY_PROFILES, type Industry } from "@/lib/site-spec/industries";
import { Check, CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { CONTEXT_FIELD_LABELS } from "@/lib/domain/labels";
import type { FirstDraft } from "@/lib/domain/site-specs";
import type { Client, Project } from "@/lib/domain/types";
import { SITE_LOCALE_LABELS, SITE_LOCALES, type SiteLocale } from "@/lib/site-spec/catalog";
import { SITE_TEMPLATE_LABELS, SITE_TEMPLATES, suggestedTemplate, templateSpec, type SiteTemplate } from "@/lib/site-spec/templates";

/** The start of a project's website spec: choose a template and languages, and see what the brief fills in. */
const LOCALES_KEY = "studio-os:spec-locales";
type Design = "services" | "association" | "";

function rememberedLocales(): SiteLocale[] {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(LOCALES_KEY) ?? "null");
    if (Array.isArray(saved)) {
      const valid = saved.filter((l): l is SiteLocale => (SITE_LOCALES as readonly string[]).includes(l));
      if (valid.length) return valid;
    }
  } catch {
    // Nothing remembered, or storage is off.
  }
  return ["en"];
}

export function StartSpec({
  client,
  project,
  backHref,
  canEdit,
  pending,
  onStart,
  ai,
}: {
  client: Client;
  project: Project;
  backHref: string;
  canEdit: boolean;
  pending: boolean;
  onStart: (from: FirstDraft, then?: { aiDraft: boolean }) => void;
  /** Present when an AI model is set up: how much of the client's material there is to draft from. */
  ai?: { sources: number };
}) {
  const [aiDraft, setAiDraft] = useState(false);
  const [consent, setConsent] = useState(false);
  const suggested = suggestedTemplate(project);
  const [template, setTemplate] = useState<SiteTemplate>(suggested);
  // The languages chosen last time on this browser: a studio mostly builds in the same ones.
  const [locales, setLocales] = useState<SiteLocale[]>(rememberedLocales);
  const [industry, setIndustry] = useState<Industry | "">("");
  // Choosing the trade also picks the company design in its style, unless a design was chosen already.
  const [design, setDesign] = useState<Design>("");
  const chooseIndustry = (next: Industry | "") => {
    setIndustry(next);
    if (next && !design) setDesign("services");
  };
  const start = () => {
    try {
      window.localStorage.setItem(LOCALES_KEY, JSON.stringify(locales));
    } catch {
      // Private windows may refuse storage; the choice is only a convenience.
    }
    onStart({ template, locales, ...(industry ? { industry } : {}), ...(design ? { design } : {}) }, { aiDraft: Boolean(ai) && aiDraft });
  };

  const { spec, unconfirmed } = useMemo(() => templateSpec(client, project, template, locales), [client, project, template, locales]);
  const sections = spec.pages.reduce((sum, page) => sum + page.sections.length, 0);
  const from = [spec.strategy.goal.source && "Goal", spec.strategy.audiences.length > 0 && "Audience", spec.pages.some((p) => p.sections.some((s) => s.source?.kind === "brief")) && "Products or services"].filter(Boolean);

  return (
    <Surface className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-[22px] leading-tight font-medium tracking-[-0.03em] text-ink">Start the website spec</h1>
        <p className="mt-1 text-[13.5px] text-ink-muted">
          {client.name} · {project.name}. A draft with the pages and sections the site needs, ready for you to write in. It describes the site to build: nothing is published.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
        <legend className="mb-2 text-[13px] font-medium text-ink">Starting point</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {SITE_TEMPLATES.map((key) => (
            <label
              key={key}
              className={cn(
                "flex cursor-pointer flex-col gap-1 rounded-[var(--radius-control)] border p-3 text-[13.5px] has-[:focus-visible]:outline-2",
                template === key ? "border-ink bg-sunken" : "border-line-strong hover:border-ink",
              )}
            >
              <span className="flex items-center gap-2 font-medium text-ink">
                <input type="radio" name="spec-template" checked={template === key} onChange={() => setTemplate(key)} />
                {SITE_TEMPLATE_LABELS[key].label}
              </span>
              {key === suggested ? <span className="text-[12px] text-ink-subtle">Suggested for this project</span> : null}
              <span className="text-[12.5px] text-ink-muted">{SITE_TEMPLATE_LABELS[key].pages}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="start-industry" label="Their trade" hint="Decides the starting style and how the texts sound.">
          <Select id="start-industry" value={industry} disabled={!canEdit} onChange={(e) => chooseIndustry(e.target.value as Industry | "")}>
            <option value="">Choose later</option>
            {INDUSTRIES.map((key) => (
              <option key={key} value={key}>
                {INDUSTRY_PROFILES[key].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="start-design" label="Design" hint="Can be changed under Design at any time.">
          <Select id="start-design" value={design} disabled={!canEdit} onChange={(e) => setDesign(e.target.value as Design)}>
            <option value="">Choose later</option>
            <option value="services">Company design{industry ? `, ${INDUSTRY_PROFILES[industry].label.toLowerCase()} style` : ""}</option>
            <option value="association">Association design</option>
          </Select>
        </Field>
      </div>

      <fieldset className="flex flex-col gap-2" disabled={!canEdit}>
        <legend className="mb-2 text-[13px] font-medium text-ink">Languages</legend>
        <div className="flex flex-wrap gap-4">
          {SITE_LOCALES.map((locale) => {
            const on = locales.includes(locale);
            return (
              <label key={locale} className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={on && locales.length === 1}
                  onChange={() => setLocales(on ? locales.filter((l) => l !== locale) : SITE_LOCALES.filter((l) => l === locale || locales.includes(l)))}
                />
                {SITE_LOCALE_LABELS[locale]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-caution/25 bg-caution/[0.06] px-3 py-2.5 text-[13px] text-ink" data-testid="draft-limits">
        {SITE_TEMPLATE_LABELS[template].note ? <p>{SITE_TEMPLATE_LABELS[template].note}</p> : null}
        <p>
          {client.email
            ? `The contact form and privacy page start from the studio's standard wording, with ${client.email}. Have the client read the privacy text.`
            : "The privacy page and consent text are placeholders: add the client's e-mail to start from the studio's standard wording."}
        </p>
      </div>

      <div className="flex flex-col gap-1.5 text-[13.5px]" data-testid="from-brief">
        <p className="text-[13px] font-medium text-ink">From the confirmed brief</p>
        {from.length ? (
          <p className="flex items-center gap-2 text-ink-muted">
            <Check aria-hidden className="size-4 shrink-0 text-positive" />
            {from.join(", ")}
          </p>
        ) : (
          <p className="text-ink-subtle">Nothing is confirmed yet, so the draft starts with instructions to write.</p>
        )}
        {unconfirmed.length ? (
          <p className="flex items-center gap-2 text-ink-muted">
            <CircleAlert aria-hidden className="size-4 shrink-0 text-caution" />
            <span>
              Not confirmed yet, so left out: {unconfirmed.map((k) => CONTEXT_FIELD_LABELS[k]).join(", ")}.{" "}
              <a href={`${backHref}#brief`} className="underline underline-offset-2 hover:text-ink">
                Confirm in the brief
              </a>
            </span>
          </p>
        ) : null}
      </div>

      {ai ? (
        <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-accent/40 bg-accent-soft/50 px-4 py-3" data-testid="start-ai">
          <label className="flex items-start gap-2 text-[13.5px] text-ink">
            <input type="checkbox" className="mt-1" checked={aiDraft} disabled={!canEdit} onChange={(e) => setAiDraft(e.target.checked)} />
            <span>
              <span className="font-medium">Then draft the whole site from the client&apos;s material</span>
              <span className="block text-[12.5px] text-ink-muted">
                Claude reads the brief{ai.sources ? `, ${ai.sources === 1 ? "1 text" : `${ai.sources} texts`} under Sources` : ""} and any kept files, and proposes every page, the concept and the texts, each with the line it comes from. Takes a few minutes; about $0.30–1.
              </span>
            </span>
          </label>
          {aiDraft ? (
            <label className="flex items-start gap-2 pl-6 text-[13px] text-ink">
              <input type="checkbox" className="mt-0.5" checked={consent} disabled={!canEdit} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                The client agreed that their material is processed by AI (Anthropic, USA).
                <span className="block text-[12px] text-ink-subtle">Required before any of their material is sent.</span>
              </span>
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <p data-testid="draft-size" className="text-[12.5px] text-ink-subtle">
          Creates {spec.pages.length === 1 ? "1 page" : `${spec.pages.length} pages`}, {sections} sections and {spec.assets.length === 1 ? "1 image placeholder" : `${spec.assets.length} image placeholders`}.
        </p>
        <div className="flex gap-2">
          <ButtonLink href={backHref} variant="ghost">
            Back to client
          </ButtonLink>
          {canEdit ? (
            <Button variant="primary" disabled={pending || (Boolean(ai) && aiDraft && !consent)} onClick={start}>
              {pending ? "Creating…" : ai && aiDraft ? "Create and draft with AI" : "Create draft"}
            </Button>
          ) : null}
        </div>
      </div>
    </Surface>
  );
}
