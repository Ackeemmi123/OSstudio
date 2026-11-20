"use client";

import { useEffect, useMemo, useState } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/data/studio-store";
import type { SiteSpecRecord } from "@/lib/domain/types";
import type { RenderImageFile } from "@/lib/site-render/model";
import { SERVICES_DIRECTION_LABELS, SERVICES_DIRECTIONS, SERVICES_MOTIF_NOTES, SERVICES_PALETTE_NOTES } from "@/lib/site-spec/catalog";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { PreviewFrame } from "./preview-frame";

type Style = NonNullable<SiteSpec["brand"]["servicesStyle"]>;
type Option = { style: Style; reason: string };

const sameStyle = (a: Style | undefined, b: Style) => !!a && a.direction === b.direction && a.palette === b.palette && (a.type ?? "") === (b.type ?? "") && (a.motif ?? "") === (b.motif ?? "");

/** The AI draft's proposals; without them, the three directions in the spec's current colours. */
export function styleOptions(spec: SiteSpec): { options: Option[]; proposed: boolean } {
  const proposals = spec.brand.styleProposals ?? [];
  if (proposals.length) return { options: proposals.map(({ reason, ...style }) => ({ style, reason })), proposed: true };
  const palette = spec.brand.servicesStyle?.palette ?? "pine";
  return { options: SERVICES_DIRECTIONS.map((direction) => ({ style: { direction, palette }, reason: "" })), proposed: false };
}

export function styleName(style: Style): string {
  return [SERVICES_DIRECTION_LABELS[style.direction].split(":")[0], style.palette[0].toUpperCase() + style.palette.slice(1), style.type ? `${style.type} type` : "", style.motif ? `${style.motif} motif` : ""].filter(Boolean).join(" · ");
}

/**
 * The company design's style options side by side, each drawn with the
 * client's real content. A person chooses one for a draft; it is saved in the
 * spec and used when the site is built.
 */
export function StyleComparison({ record, spec, imageFiles, pageId, onSaved }: { record: SiteSpecRecord; spec: SiteSpec; imageFiles: Readonly<Record<string, RenderImageFile>>; pageId: string; onSaved: (saved: SiteSpecRecord) => void }) {
  const store = useStudioStore();
  const { run, pending, canEdit } = useStudioAction();
  const { options, proposed } = useMemo(() => styleOptions(spec), [spec]);
  // Drawn pages by style, page and spec, so a result for an earlier spec is never shown for the current one.
  const [drawn, setDrawn] = useState<Record<string, { html?: string; problem?: string }>>({});
  const keyOf = (style: Style) => `${pageId}|${record.updatedAt}|${style.direction}|${style.palette}|${style.type ?? ""}|${style.motif ?? ""}`;

  useEffect(() => {
    let active = true;
    options.forEach((option) => {
      const key = `${pageId}|${record.updatedAt}|${option.style.direction}|${option.style.palette}|${option.style.type ?? ""}|${option.style.motif ?? ""}`;
      const styled: SiteSpec = { ...spec, brand: { ...spec.brand, servicesStyle: option.style } };
      store
        .read((r) => (r.previewServices ? r.previewServices(styled, imageFiles, pageId) : Promise.resolve({ missing: ["Previews need a signed-in workspace."] })))
        .then(
          (result) => active && setDrawn((now) => ({ ...now, [key]: "html" in result ? { html: result.html } : { problem: result.missing.join(" ") } })),
          (error: unknown) => active && setDrawn((now) => ({ ...now, [key]: { problem: errorMessage(error) } })),
        );
    });
    return () => {
      active = false;
    };
  }, [options, spec, imageFiles, pageId, store, record.updatedAt]);

  const editable = canEdit && record.status === "draft";
  const choose = async (style: Style) => {
    const next: SiteSpec = { ...spec, brand: { ...spec.brand, servicesStyle: style } };
    const saved = await run((r) => r.saveSiteSpecDraft!(record, next), "The style was not saved.");
    if (saved) onSaved(saved);
  };

  return (
    <section aria-labelledby="style-comparison" className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-line bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h2 id="style-comparison" className="text-[15px] font-medium text-ink">
          Compare styles
        </h2>
        <p className="text-[13px] text-ink-subtle">
          {proposed ? "The AI draft's three proposals, drawn with this page's real content." : "No proposals from the AI draft yet, so these are the three directions in the spec's current colours."}
          {editable ? " Choosing one saves it in this draft." : record.status === "draft" ? "" : " Start a new version to change the style."}
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {options.map((option, i) => {
          const current = sameStyle(spec.brand.servicesStyle, option.style);
          const shown = drawn[keyOf(option.style)];
          return (
            <div key={`${option.style.direction}-${option.style.palette}-${i}`} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium text-ink">{styleName(option.style)}</span>
                  <span className="text-[12.5px] text-ink-subtle">
                    {SERVICES_PALETTE_NOTES[option.style.palette]}
                    {option.style.motif ? `; motif from ${SERVICES_MOTIF_NOTES[option.style.motif]}` : ""}
                  </span>
                </div>
                {current ? (
                  <span className="shrink-0 text-[12.5px] text-ink">Chosen</span>
                ) : editable ? (
                  <Button size="xs" variant="secondary" disabled={pending} onClick={() => choose(option.style)}>
                    Use this style
                  </Button>
                ) : null}
              </div>
              {option.reason ? <p className="text-[13px] text-ink">{option.reason}</p> : null}
              {shown?.html ? (
                <PreviewFrame html={shown.html} title={`Style ${i + 1}: ${styleName(option.style)}`} viewport="desktop" height="420px" testId={`style-preview-${i}`} />
              ) : (
                <p className="text-[13px] text-ink-subtle">{shown?.problem ? `Cannot be drawn yet. ${shown.problem}` : "Drawing…"}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
