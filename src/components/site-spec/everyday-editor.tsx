"use client";

import { ArrowDown, ArrowUp, ImagePlus, X } from "lucide-react";
import { Field, TextInput } from "@/components/ui/field";
import { IconButton } from "@/components/ui/button";
import type { SiteSpec } from "@/lib/site-spec/schema";
import type { ImageLibrary } from "./images-editor";
import type { SpecEditing } from "./site-spec-editor";

type Everyday = NonNullable<NonNullable<SiteSpec["signature"]>["everyday"]>;

const MAX = 5;
const MIN = 3;

/**
 * "An ordinary day": three to five of the client's own photos, each with a
 * time of day and one line, in the order a day goes. Only the spec's images
 * that have a stored file can be chosen; the build checks their rights as for
 * every other image.
 */
export function EverydayEditor({ spec, editing, library }: { spec: SiteSpec; editing: SpecEditing; library?: ImageLibrary }) {
  const { editable, change, personSource } = editing;
  const locale = spec.locales.default;
  const part = spec.signature?.everyday;
  const items = part?.items ?? [];
  const photos = spec.assets.filter((asset) => asset.fileId && asset.origin !== "placeholder");
  const chosen = new Set(items.map((item) => item.assetId));
  const available = photos.filter((asset) => !chosen.has(asset.id));
  const byId = new Map(spec.assets.map((asset) => [asset.id, asset]));
  const thumb = (assetId: string) => {
    const fileId = byId.get(assetId)?.fileId;
    return fileId ? library?.links[fileId] : undefined;
  };
  const describe = (assetId: string) => byId.get(assetId)?.alt[locale]?.trim() || byId.get(assetId)?.description || "Photo";

  /** Edits the part, creating it the first time. */
  const edit = (apply: (part: Everyday) => void) =>
    change((s) => {
      s.signature ??= {};
      const next: Everyday = structuredClone(s.signature.everyday ?? { label: {}, heading: {}, items: [] });
      apply(next);
      s.signature.everyday = next;
      s.signature.source = personSource();
    });

  return (
    <div className="flex flex-col gap-4" data-testid="everyday-editor">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="everyday-heading" label="Heading" hint="For example: A day at the workshop">
          <TextInput
            id="everyday-heading"
            value={part?.heading[locale] ?? ""}
            maxLength={110}
            disabled={!editable}
            onChange={(e) => edit((p) => void (p.heading[locale] = e.target.value))}
          />
        </Field>
        <Field id="everyday-label" label="Small label above it" hint="Optional. Empty: “An ordinary day”.">
          <TextInput id="everyday-label" value={part?.label[locale] ?? ""} maxLength={60} disabled={!editable} onChange={(e) => edit((p) => void (p.label[locale] = e.target.value))} />
        </Field>
      </div>

      {items.length ? (
        <ol className="flex flex-col gap-3" aria-label="Photos of the day, in order">
          {items.map((item, i) => {
            const src = thumb(item.assetId);
            return (
              <li key={item.assetId} className="flex gap-3 rounded-[var(--radius-control)] border border-line bg-surface p-3" data-testid="everyday-item">
                <div className="size-20 shrink-0 overflow-hidden rounded-[8px] bg-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not an optimisable asset */}
                  {src ? <img src={src} alt="" className="size-full object-cover" /> : null}
                </div>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[110px_minmax(0,1fr)]">
                  <Field id={`everyday-when-${i}`} label="When">
                    <TextInput
                      id={`everyday-when-${i}`}
                      value={item.when ?? ""}
                      maxLength={20}
                      placeholder="07:00"
                      disabled={!editable}
                      onChange={(e) => edit((p) => void (e.target.value ? (p.items[i].when = e.target.value) : delete p.items[i].when))}
                    />
                  </Field>
                  <Field id={`everyday-text-${i}`} label="One line about it" hint={describe(item.assetId)}>
                    <TextInput
                      id={`everyday-text-${i}`}
                      value={item.text[locale] ?? ""}
                      maxLength={140}
                      disabled={!editable}
                      onChange={(e) => edit((p) => void (p.items[i].text[locale] = e.target.value))}
                    />
                  </Field>
                </div>
                {editable ? (
                  <div className="flex shrink-0 flex-col">
                    <IconButton label="Move earlier in the day" disabled={i === 0} onClick={() => edit((p) => void p.items.splice(i - 1, 0, p.items.splice(i, 1)[0]))}>
                      <ArrowUp aria-hidden />
                    </IconButton>
                    <IconButton label="Move later in the day" disabled={i === items.length - 1} onClick={() => edit((p) => void p.items.splice(i + 1, 0, p.items.splice(i, 1)[0]))}>
                      <ArrowDown aria-hidden />
                    </IconButton>
                    <IconButton label="Remove this photo" onClick={() => edit((p) => void p.items.splice(i, 1))}>
                      <X aria-hidden />
                    </IconButton>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}

      <p className="text-[12.5px] text-ink-subtle">
        {items.length < MIN ? `Choose at least ${MIN - items.length} more of the client's own photos (${MIN} to ${MAX}).` : items.length < MAX ? `${items.length} of up to ${MAX} photos.` : `${MAX} photos, the most it shows.`}
      </p>

      {editable && items.length < MAX ? (
        available.length ? (
          <div>
            <p className="mb-2 text-[13px] text-ink">Add a photo</p>
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-label="The spec's photos">
              {available.map((asset) => {
                const src = asset.fileId ? library?.links[asset.fileId] : undefined;
                return (
                  <li key={asset.id}>
                    <button
                      type="button"
                      onClick={() => edit((p) => void p.items.push({ assetId: asset.id, text: {} }))}
                      className="group relative block aspect-square w-full overflow-hidden rounded-[8px] border border-line bg-sunken text-left hover:border-ink"
                      title={describe(asset.id)}
                      aria-label={`Add: ${describe(asset.id)}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link */}
                      {src ? <img src={src} alt="" className="size-full object-cover transition-transform group-hover:scale-[1.03]" /> : <span className="block p-2 text-[11px] text-ink-subtle">{describe(asset.id)}</span>}
                      <span className="absolute right-1 bottom-1 flex size-6 items-center justify-center rounded-full bg-surface/90 text-ink opacity-0 transition-opacity group-hover:opacity-100">
                        <ImagePlus aria-hidden className="size-3.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-ink-subtle">
            {photos.length ? "Every photo in the spec is already chosen." : "No photos in the spec yet."} Upload more of the client&apos;s own photos under Content › Site settings › Images, then choose them here.
          </p>
        )
      ) : null}
    </div>
  );
}
