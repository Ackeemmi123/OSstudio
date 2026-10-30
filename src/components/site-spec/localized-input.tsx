"use client";

import { useId } from "react";
import { Field, TextArea, TextInput } from "@/components/ui/field";
import { SITE_LOCALE_LABELS, type SiteLocale } from "@/lib/site-spec/catalog";
import type { LocalizedText } from "@/lib/site-spec/schema";

/** One input per website language. With a single language the language is not shown. */
export function LocalizedInput({
  label,
  value,
  locales,
  onChange,
  multiline,
  maxLength,
  disabled,
  hint,
}: {
  label: string;
  value: LocalizedText;
  locales: SiteLocale[];
  onChange: (next: LocalizedText) => void;
  multiline?: boolean;
  maxLength?: number;
  disabled?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      {locales.map((locale) => {
        const fieldId = `${id}-${locale}`;
        const fieldLabel = locales.length > 1 ? `${label} (${SITE_LOCALE_LABELS[locale]})` : label;
        const common = {
          id: fieldId,
          value: value[locale] ?? "",
          maxLength,
          disabled,
          onChange: (e: { target: { value: string } }) => onChange({ ...value, [locale]: e.target.value }),
        };
        return (
          <Field key={locale} id={fieldId} label={fieldLabel} hint={locale === locales[0] ? hint : undefined}>
            {multiline ? <TextArea rows={3} {...common} /> : <TextInput {...common} />}
          </Field>
        );
      })}
    </div>
  );
}
