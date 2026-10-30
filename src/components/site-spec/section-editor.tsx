"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/field";
import {
  ITEM_FIELDS,
  ITEM_LIMITS,
  MOBILE_BEHAVIOURS,
  MOBILE_LABELS,
  SECTION_FIELDS,
  SECTION_LABELS,
  SECTION_VARIANTS,
  VARIANT_LABELS,
  type ItemFieldDefinition,
  type SectionFieldDefinition,
} from "@/lib/site-spec/catalog";
import { move, newItem } from "@/lib/site-spec/edit";
import type { LocalizedText, SiteSpec, SiteSpecButton, SiteSpecSection } from "@/lib/site-spec/schema";
import { LocalizedInput } from "./localized-input";
import type { SpecEditing } from "./site-spec-editor";
import { SourceTag } from "./strategy-editor";

type Values = Record<string, unknown>;

/**
 * One section, with a form made from the catalogue's field list for its kind.
 * Any edit makes the section a person's work (its source becomes "person").
 */
export function SectionEditor({
  spec,
  pageIndex,
  sectionIndex,
  editing,
}: {
  spec: SiteSpec;
  pageIndex: number;
  sectionIndex: number;
  editing: SpecEditing;
}) {
  const { editable, change, personSource } = editing;
  const section = spec.pages[pageIndex].sections[sectionIndex];
  const values = section as unknown as Values;
  const locales = spec.locales.available;
  const sectionCount = spec.pages[pageIndex].sections.length;
  const idPrefix = `section-${section.id}`;

  const edit = (apply: (target: Values) => void) =>
    change((s) => {
      const target = s.pages[pageIndex].sections[sectionIndex] as unknown as Values;
      apply(target);
      target.source = personSource();
    });

  const field = (def: SectionFieldDefinition) => {
    const key = `${idPrefix}-${def.key}`;
    switch (def.type) {
      case "text":
      case "longText":
        return (
          <LocalizedInput
            key={key}
            label={def.label}
            value={(values[def.key] as LocalizedText) ?? {}}
            locales={locales}
            multiline={def.type === "longText"}
            disabled={!editable}
            onChange={(next) => edit((t) => void (t[def.key] = next))}
          />
        );
      case "image":
        return <ImagePicker key={key} id={key} label={def.label} spec={spec} value={values[def.key] as string | undefined} disabled={!editable} onChange={(id) => edit((t) => void (id ? (t[def.key] = id) : delete t[def.key]))} />;
      case "images":
        return (
          <fieldset key={key} className="flex flex-col gap-1.5">
            <legend className="text-[13px] font-medium text-ink">{def.label}</legend>
            {spec.assets.length === 0 ? <p className="text-[12px] text-ink-subtle">Add images under Site settings first.</p> : null}
            {spec.assets.map((asset) => {
              const selected = (values.assetIds as string[]).includes(asset.id);
              return (
                <label key={asset.id} className="flex items-center gap-2 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!editable}
                    onChange={() => edit((t) => void (t.assetIds = selected ? (t.assetIds as string[]).filter((id) => id !== asset.id) : [...(t.assetIds as string[]), asset.id]))}
                  />
                  {asset.description || asset.id}
                </label>
              );
            })}
          </fieldset>
        );
      case "form":
        return (
          <Field key={key} id={key} label={def.label}>
            <Select id={key} value={(values.formId as string) ?? ""} disabled={!editable} onChange={(e) => edit((t) => void (e.target.value ? (t.formId = e.target.value) : delete t.formId))}>
              <option value="">No form</option>
              {spec.forms.map((form) => (
                <option key={form.id} value={form.id}>
                  {form.id}
                </option>
              ))}
            </Select>
          </Field>
        );
      case "button":
        return <ButtonEditor key={key} id={key} spec={spec} button={values.button as SiteSpecButton} disabled={!editable} onChange={(next) => edit((t) => void (t.button = next))} />;
      case "buttons": {
        const buttons = values.buttons as SiteSpecButton[];
        return (
          <div key={key} className="flex flex-col gap-3">
            <p className="text-[13px] font-medium text-ink">{def.label}</p>
            {buttons.map((b, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line p-3">
                <ButtonEditor id={`${key}-${i}`} spec={spec} button={b} disabled={!editable} onChange={(next) => edit((t) => void ((t.buttons as SiteSpecButton[])[i] = next))} />
                {editable ? (
                  <Button size="xs" variant="ghost" className="self-start" onClick={() => edit((t) => void (t.buttons as SiteSpecButton[]).splice(i, 1))}>
                    Remove button
                  </Button>
                ) : null}
              </div>
            ))}
            {editable && buttons.length < (def.max ?? 1) ? (
              <Button size="xs" className="self-start" onClick={() => edit((t) => void (t.buttons as SiteSpecButton[]).push({ label: {}, targetPageId: spec.pages[0].id }))}>
                Add a button
              </Button>
            ) : null}
          </div>
        );
      }
      case "items":
        return <ItemsEditor key={key} spec={spec} section={section} editable={editable} edit={edit} />;
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-surface)] border border-line bg-surface p-4" data-testid="spec-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-ink">{SECTION_LABELS[section.kind].label}</p>
          <SourceTag source={section.source} />
        </div>
        {editable ? (
          <div className="flex items-center gap-1">
            <IconButton label="Move section up" disabled={sectionIndex === 0} onClick={() => change((s) => void (s.pages[pageIndex].sections = move(s.pages[pageIndex].sections, sectionIndex, -1)))}>
              <ArrowUp />
            </IconButton>
            <IconButton label="Move section down" disabled={sectionIndex === sectionCount - 1} onClick={() => change((s) => void (s.pages[pageIndex].sections = move(s.pages[pageIndex].sections, sectionIndex, 1)))}>
              <ArrowDown />
            </IconButton>
            <Button size="xs" variant="ghost" onClick={() => change((s) => void s.pages[pageIndex].sections.splice(sectionIndex, 1))}>
              Remove section
            </Button>
          </div>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={`${idPrefix}-variant`} label="Layout">
          <Select id={`${idPrefix}-variant`} value={section.variant} disabled={!editable} onChange={(e) => edit((t) => void (t.variant = e.target.value))}>
            {SECTION_VARIANTS[section.kind].map((v) => (
              <option key={v} value={v}>
                {VARIANT_LABELS[v] ?? v}
              </option>
            ))}
          </Select>
        </Field>
        <Field id={`${idPrefix}-mobile`} label="On phones">
          <Select id={`${idPrefix}-mobile`} value={section.mobile ?? ""} disabled={!editable} onChange={(e) => edit((t) => void (e.target.value ? (t.mobile = e.target.value) : delete t.mobile))}>
            <option value="">Renderer default</option>
            {MOBILE_BEHAVIOURS.map((v) => (
              <option key={v} value={v}>
                {MOBILE_LABELS[v]}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {SECTION_FIELDS[section.kind].map(field)}
    </div>
  );
}

function ImagePicker({ id, label, spec, value, disabled, onChange }: { id: string; label: string; spec: SiteSpec; value?: string; disabled: boolean; onChange: (id: string) => void }) {
  return (
    <Field id={id} label={label}>
      <Select id={id} value={value ?? ""} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        <option value="">No image</option>
        {spec.assets.map((asset) => (
          <option key={asset.id} value={asset.id}>
            {asset.description || asset.id}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function ButtonEditor({ id, spec, button, disabled, onChange }: { id: string; spec: SiteSpec; button: SiteSpecButton; disabled: boolean; onChange: (next: SiteSpecButton) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <LocalizedInput label="Button label" value={button.label} locales={spec.locales.available} maxLength={40} disabled={disabled} onChange={(label) => onChange({ ...button, label })} />
      <Field id={`${id}-target`} label="It leads to">
        <Select id={`${id}-target`} value={button.targetPageId} disabled={disabled} onChange={(e) => onChange({ ...button, targetPageId: e.target.value })}>
          {spec.pages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.title[spec.locales.default] || page.id}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

function ItemsEditor({ spec, section, editable, edit }: { spec: SiteSpec; section: SiteSpecSection; editable: boolean; edit: (apply: (target: Values) => void) => void }) {
  const fields = ITEM_FIELDS[section.kind] ?? [];
  const items = (section as unknown as { items: Values[] }).items;
  const limit = ITEM_LIMITS[section.kind] ?? 0;
  const itemField = (def: ItemFieldDefinition, item: Values, i: number) => {
    const key = `item-${item.id as string}-${def.key}`;
    const set = (value: unknown) => edit((t) => void ((t.items as Values[])[i][def.key] = value));
    if (def.type === "plain") {
      return (
        <Field key={key} id={key} label={def.label}>
          <TextInput id={key} value={(item[def.key] as string) ?? ""} maxLength={80} disabled={!editable} onChange={(e) => set(e.target.value)} />
        </Field>
      );
    }
    if (def.type === "image") {
      return <ImagePicker key={key} id={key} label={def.label} spec={spec} value={item[def.key] as string | undefined} disabled={!editable} onChange={(id) => edit((t) => void (id ? ((t.items as Values[])[i][def.key] = id) : delete (t.items as Values[])[i][def.key]))} />;
    }
    return <LocalizedInput key={key} label={def.label} value={(item[def.key] as LocalizedText) ?? {}} locales={spec.locales.available} multiline={def.type === "longText"} disabled={!editable} onChange={set} />;
  };
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div key={item.id as string} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line p-3">
          {fields.map((def) => itemField(def, item, i))}
          {editable ? (
            <div className="flex gap-1">
              <IconButton label="Move up" disabled={i === 0} onClick={() => edit((t) => void (t.items = move(t.items as Values[], i, -1)))}>
                <ArrowUp />
              </IconButton>
              <IconButton label="Move down" disabled={i === items.length - 1} onClick={() => edit((t) => void (t.items = move(t.items as Values[], i, 1)))}>
                <ArrowDown />
              </IconButton>
              <Button size="xs" variant="ghost" onClick={() => edit((t) => void (t.items as Values[]).splice(i, 1))}>
                Remove
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {editable && items.length < limit ? (
        <Button size="xs" className="self-start" onClick={() => edit((t) => void (t.items as Values[]).push(newItem(spec, section.kind)))}>
          Add an item
        </Button>
      ) : null}
    </div>
  );
}
