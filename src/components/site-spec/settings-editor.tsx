"use client";

import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import {
  FORM_FIELD_LABELS,
  FORM_FIELDS,
  FORM_PURPOSE_LABELS,
  FORM_PURPOSES,
  INTEGRATION_LABELS,
  INTEGRATIONS,
  SITE_LOCALE_LABELS,
  SITE_LOCALES,
  STRUCTURED_DATA_TYPES,
} from "@/lib/site-spec/catalog";
import { newForm } from "@/lib/site-spec/edit";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { ImagesEditor, type ImageLibrary } from "./images-editor";
import { LocalizedInput } from "./localized-input";
import type { SpecEditing } from "./site-spec-editor";

/** Languages, site-wide search texts, images (with the client's image library), forms and integrations. */
export function SettingsEditor({ spec, clientId, editing, library }: { spec: SiteSpec; clientId: string; editing: SpecEditing; library: ImageLibrary }) {
  const { editable, change } = editing;
  const locales = spec.locales.available;

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[13px] font-medium text-ink">Languages</legend>
        <div className="flex flex-wrap gap-4">
          {SITE_LOCALES.map((locale) => {
            const on = locales.includes(locale);
            return (
              <label key={locale} className="flex items-center gap-2 text-[13px] text-ink">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={!editable || (on && locales.length === 1)}
                  onChange={() =>
                    change((s) => {
                      s.locales.available = on ? s.locales.available.filter((l) => l !== locale) : SITE_LOCALES.filter((l) => l === locale || s.locales.available.includes(l));
                      if (!s.locales.available.includes(s.locales.default)) s.locales.default = s.locales.available[0];
                    })
                  }
                />
                {SITE_LOCALE_LABELS[locale]}
              </label>
            );
          })}
        </div>
        <Field id="spec-default-locale" label="Default language" className="max-w-xs">
          <Select id="spec-default-locale" value={spec.locales.default} disabled={!editable} onChange={(e) => change((s) => void (s.locales.default = e.target.value as SiteSpec["locales"]["default"]))}>
            {locales.map((locale) => (
              <option key={locale} value={locale}>
                {SITE_LOCALE_LABELS[locale]}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-[13px] font-medium text-ink">Search engines</legend>
        <LocalizedInput label="Site name" value={spec.seo.siteName} locales={locales} maxLength={60} disabled={!editable} onChange={(siteName) => change((s) => void (s.seo.siteName = siteName))} />
        <LocalizedInput label="Default description" value={spec.seo.defaultDescription} locales={locales} maxLength={160} multiline disabled={!editable} onChange={(d) => change((s) => void (s.seo.defaultDescription = d))} />
        <Field id="spec-structured" label="Business type for search engines">
          <Select id="spec-structured" value={spec.seo.structuredData} disabled={!editable} onChange={(e) => change((s) => void (s.seo.structuredData = e.target.value as SiteSpec["seo"]["structuredData"]))}>
            {STRUCTURED_DATA_TYPES.map((v) => (
              <option key={v} value={v}>
                {v === "none" ? "None" : v === "LocalBusiness" ? "Local business" : v}
              </option>
            ))}
          </Select>
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[13px] font-medium text-ink">Images</legend>
        <ImagesEditor spec={spec} clientId={clientId} editing={editing} library={library} />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-[13px] font-medium text-ink">Forms</legend>
        <p className="text-[12.5px] text-ink-subtle">Answers go to the client&apos;s contact person. A form asks only for the fields ticked here.</p>
        {spec.forms.map((form, f) => (
          <div key={form.id} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line p-3">
            <div className="flex flex-wrap items-end gap-4">
              <Field id={`form-${form.id}-purpose`} label={`Form ${form.id}`} className="max-w-xs">
                <Select id={`form-${form.id}-purpose`} value={form.purpose} disabled={!editable} onChange={(e) => change((s) => void (s.forms[f].purpose = e.target.value as (typeof FORM_PURPOSES)[number]))}>
                  {FORM_PURPOSES.map((v) => (
                    <option key={v} value={v}>
                      {FORM_PURPOSE_LABELS[v]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-wrap gap-3">
                {FORM_FIELDS.map((name) => {
                  const on = form.fields.includes(name);
                  return (
                    <label key={name} className="flex items-center gap-1.5 text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={on}
                        disabled={!editable || (on && form.fields.length === 1)}
                        onChange={() => change((s) => void (s.forms[f].fields = on ? s.forms[f].fields.filter((x) => x !== name) : FORM_FIELDS.filter((x) => x === name || s.forms[f].fields.includes(x))))}
                      />
                      {FORM_FIELD_LABELS[name]}
                    </label>
                  );
                })}
              </div>
            </div>
            <LocalizedInput label="Consent text" hint="Says what the answers are used for." value={form.consentText} locales={locales} maxLength={300} multiline disabled={!editable} onChange={(t) => change((s) => void (s.forms[f].consentText = t))} />
            {editable ? (
              <Button size="xs" variant="ghost" className="self-start" onClick={() => change((s) => void s.forms.splice(f, 1))}>
                Remove form
              </Button>
            ) : null}
          </div>
        ))}
        {editable && spec.forms.length < 5 ? (
          <Button size="xs" className="self-start" onClick={() => { const form = newForm(spec); change((s) => void s.forms.push(form)); }}>
            Add a form
          </Button>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-[13px] font-medium text-ink">Features the site needs</legend>
        {INTEGRATIONS.map((key) => (
          <label key={key} className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={spec.integrations[key].enabled} disabled={!editable} onChange={(e) => change((s) => void (s.integrations[key].enabled = e.target.checked))} />
            {INTEGRATION_LABELS[key]}
          </label>
        ))}
      </fieldset>
    </div>
  );
}
