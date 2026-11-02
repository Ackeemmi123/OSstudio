"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, Select } from "@/components/ui/field";
import { buildRenderModel, type RenderImageFile } from "@/lib/site-render/model";
import { renderPreviewDocument } from "@/lib/site-render/document";
import { SITE_LOCALE_LABELS, type SiteLocale } from "@/lib/site-spec/catalog";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { PreviewFrame, ViewportButtons, type Viewport } from "./preview-frame";

/** How long typing has to pause before the page is drawn again. */
const REDRAW_DELAY_MS = 300;

/**
 * The page being edited, drawn from the draft in this browser: nothing has to
 * be saved first. While the draft is invalid, the last version that could be
 * drawn stays up, with a note.
 */
export function LivePreview({
  spec,
  pageId,
  locale,
  imageFiles,
  showMissingByDefault,
  onPage,
  onLocale,
}: {
  /** The draft, or null while it is not a valid website spec. */
  spec: SiteSpec | null;
  pageId?: string;
  locale?: SiteLocale;
  imageFiles: Readonly<Record<string, RenderImageFile>>;
  showMissingByDefault: boolean;
  onPage: (pageId: string) => void;
  onLocale: (locale: SiteLocale) => void;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [showMissing, setShowMissing] = useState(showMissingByDefault);
  const [shown, setShown] = useState(spec);

  useEffect(() => {
    if (!spec || spec === shown) return;
    const timer = setTimeout(() => setShown(spec), REDRAW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [spec, shown]);

  const rendered = useMemo(() => {
    if (!shown) return null;
    const model = buildRenderModel(shown, { pageId, locale, showMissing, imageFiles });
    return { model, html: renderPreviewDocument(shown, model) };
  }, [shown, pageId, locale, showMissing, imageFiles]);

  if (!rendered || !shown) return <p className="text-[13.5px] text-ink-subtle">This draft cannot be previewed until the problems under Before approval are fixed.</p>;

  return (
    <div className="flex flex-col gap-3" data-testid="live-preview">
      <div className="flex flex-wrap items-end gap-3">
        <Field id="live-preview-page" label="Previewing" className="w-44">
          <Select id="live-preview-page" value={rendered.model.page.id} onChange={(e) => onPage(e.target.value)}>
            {rendered.model.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.depth ? `– ${p.title}` : p.title}
              </option>
            ))}
          </Select>
        </Field>
        {shown.locales.available.length > 1 ? (
          <Field id="live-preview-language" label="Language" className="w-32">
            <Select id="live-preview-language" value={rendered.model.lang} onChange={(e) => onLocale(e.target.value as SiteLocale)}>
              {shown.locales.available.map((l) => (
                <option key={l} value={l}>
                  {SITE_LOCALE_LABELS[l]}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <ViewportButtons viewport={viewport} onChange={setViewport} />
        <label className="flex h-9 items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} />
          Show what&apos;s missing
          {rendered.model.missingCount ? <span className="text-ink-subtle">({rendered.model.missingCount})</span> : null}
        </label>
      </div>
      {!spec ? <p data-testid="preview-stale" className="text-[12.5px] text-caution">Showing the last version that could be drawn. Fix the problems under Before approval to see newer changes.</p> : null}
      <PreviewFrame html={rendered.html} title={`Preview of ${rendered.model.page.title.text || "the page"}`} viewport={viewport} height="calc(100vh - 13rem)" />
    </div>
  );
}
