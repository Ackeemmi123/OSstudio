"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useState } from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";
import { NAV_LABELS, NAV_PLACEMENTS, SECTION_KINDS, SECTION_LABELS, SITE_LOCALE_LABELS, type SectionKind } from "@/lib/site-spec/catalog";
import { move, newPage, newSection, slugify } from "@/lib/site-spec/edit";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { LocalizedInput } from "./localized-input";
import { SectionEditor } from "./section-editor";
import type { SpecEditing } from "./site-spec-editor";

/** The sitemap: one entry per page, opened one at a time to edit its details and sections. */
export function PagesEditor({ spec, editing }: { spec: SiteSpec; editing: SpecEditing }) {
  const { editable, change } = editing;
  const [open, setOpen] = useState<string | null>(spec.pages[0]?.id ?? null);
  const [newTitle, setNewTitle] = useState("");
  const name = (i: number) => spec.pages[i].title[spec.locales.default] || (i === 0 ? "Home" : spec.pages[i].id);

  function addPage() {
    const title = newTitle.trim();
    if (!title) return;
    const page = newPage(spec, title);
    change((s) => void s.pages.push(page));
    setOpen(page.id);
    setNewTitle("");
  }

  return (
    <div className="flex flex-col gap-3">
      <ol className="flex flex-col gap-2">
        {spec.pages.map((page, p) => (
          <li key={page.id} className="rounded-[var(--radius-surface)] border border-line bg-surface">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              <button type="button" className="flex min-w-0 flex-1 items-baseline gap-2 text-left" aria-expanded={open === page.id} onClick={() => setOpen(open === page.id ? null : page.id)}>
                <span className={page.parentId ? "pl-4 text-sm text-ink" : "text-sm font-medium text-ink"}>{name(p)}</span>
                <span className="truncate text-[12.5px] text-ink-subtle">
                  /{page.parentId ? `${spec.pages.find((x) => x.id === page.parentId)?.slug[spec.locales.default] ?? "…"}/` : ""}
                  {page.slug[spec.locales.default] ?? ""} · {page.sections.length === 1 ? "1 section" : `${page.sections.length} sections`}
                </span>
              </button>
              {editable && p > 0 ? (
                <div className="flex items-center gap-1">
                  <IconButton label="Move page up" disabled={p === 1} onClick={() => change((s) => void (s.pages = [s.pages[0], ...move(s.pages.slice(1), p - 1, -1)]))}>
                    <ArrowUp />
                  </IconButton>
                  <IconButton label="Move page down" disabled={p === spec.pages.length - 1} onClick={() => change((s) => void (s.pages = [s.pages[0], ...move(s.pages.slice(1), p - 1, 1)]))}>
                    <ArrowDown />
                  </IconButton>
                  <Button size="xs" variant="ghost" onClick={() => change((s) => void s.pages.splice(p, 1))}>
                    Remove page
                  </Button>
                </div>
              ) : null}
            </div>
            {open === page.id ? <PageDetails spec={spec} pageIndex={p} editing={editing} /> : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <div className="flex items-end gap-2">
          <Field id="new-page-title" label="New page" className="max-w-xs flex-1">
            <TextInput id="new-page-title" value={newTitle} placeholder="Page title" maxLength={80} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPage()} />
          </Field>
          <Button onClick={addPage} disabled={!newTitle.trim() || spec.pages.length >= 30}>
            Add page
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function PageDetails({ spec, pageIndex, editing }: { spec: SiteSpec; pageIndex: number; editing: SpecEditing }) {
  const { editable, change } = editing;
  const page = spec.pages[pageIndex];
  const locales = spec.locales.available;
  const [kind, setKind] = useState<SectionKind>("text");
  const id = `page-${page.id}`;
  const parents = spec.pages.slice(1).filter((p) => p.id !== page.id && p.parentId === undefined);
  const hasChildren = spec.pages.some((p) => p.parentId === page.id);

  return (
    <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <LocalizedInput label="Page title" value={page.title} locales={locales} maxLength={80} disabled={!editable} onChange={(title) => change((s) => void (s.pages[pageIndex].title = title))} />
        {pageIndex > 0 ? (
          <div className="flex flex-col gap-2">
            {locales.map((locale) => (
              <Field key={locale} id={`${id}-slug-${locale}`} label={locales.length > 1 ? `Address (${SITE_LOCALE_LABELS[locale]})` : "Address"} hint="Lower-case letters, digits and hyphens.">
                <TextInput
                  id={`${id}-slug-${locale}`}
                  value={page.slug[locale] ?? ""}
                  maxLength={80}
                  disabled={!editable}
                  onChange={(e) => change((s) => void (s.pages[pageIndex].slug[locale] = e.target.value))}
                  onBlur={(e) => change((s) => void (s.pages[pageIndex].slug[locale] = slugify(e.target.value)))}
                />
              </Field>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-ink-subtle">The home page. Its address is the website&apos;s address.</p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${id}-nav`} label="Shown in">
          <Select id={`${id}-nav`} value={page.nav} disabled={!editable} onChange={(e) => change((s) => void (s.pages[pageIndex].nav = e.target.value as SiteSpec["pages"][number]["nav"]))}>
            {NAV_PLACEMENTS.map((v) => (
              <option key={v} value={v}>
                {NAV_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
        {pageIndex > 0 ? (
          <Field id={`${id}-parent`} label="Under" hint={hasChildren ? "Has pages under it, so it stays at the top level." : undefined}>
            <Select
              id={`${id}-parent`}
              value={page.parentId ?? ""}
              disabled={!editable || hasChildren}
              onChange={(e) => change((s) => void (e.target.value ? (s.pages[pageIndex].parentId = e.target.value) : delete s.pages[pageIndex].parentId))}
            >
              <option value="">Top level</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title[spec.locales.default] || p.id}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[13px] font-medium text-ink">Search engines</legend>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={page.seo.noindex} disabled={!editable} onChange={(e) => change((s) => void (s.pages[pageIndex].seo.noindex = e.target.checked))} />
          Hide this page from search engines
        </label>
        {!page.seo.noindex ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <LocalizedInput label="Search title" hint="Up to 60 characters." value={page.seo.title} locales={locales} maxLength={60} disabled={!editable} onChange={(title) => change((s) => void (s.pages[pageIndex].seo.title = title))} />
            <LocalizedInput label="Search description" hint="Up to 160 characters." value={page.seo.description} locales={locales} maxLength={160} multiline disabled={!editable} onChange={(description) => change((s) => void (s.pages[pageIndex].seo.description = description))} />
          </div>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-3">
        <p className="text-[13px] font-medium text-ink">Sections</p>
        {page.sections.length === 0 ? <p className="text-[13px] text-ink-subtle">No sections yet.</p> : null}
        {page.sections.map((section, s) => (
          <SectionEditor key={section.id} spec={spec} pageIndex={pageIndex} sectionIndex={s} editing={editing} />
        ))}
        {editable && page.sections.length < 20 ? (
          <div className="flex items-end gap-2">
            <Field id={`${id}-new-section`} label="Add a section" className="max-w-xs flex-1">
              <Select id={`${id}-new-section`} value={kind} onChange={(e) => setKind(e.target.value as SectionKind)}>
                {SECTION_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {SECTION_LABELS[k].label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={() => change((s) => void s.pages[pageIndex].sections.push(newSection(s, kind)))}>Add section</Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
