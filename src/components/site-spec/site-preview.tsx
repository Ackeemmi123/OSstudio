"use client";

import { ArrowLeft, FileText, Monitor, SearchX, Smartphone, Tablet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoadError } from "@/components/load-error";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { ButtonLink } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { StatusLabel } from "@/components/ui/status";
import { EmptyState, Surface } from "@/components/ui/surface";
import { cn } from "@/lib/cn";
import { errorMessage } from "@/lib/data/studio-store";
import { SITE_SPEC_STATUS_LABELS } from "@/lib/domain/labels";
import { isWebsiteProject, openSiteSpec } from "@/lib/domain/site-specs";
import type { SiteSpecRecord } from "@/lib/domain/types";
import { renderPreviewDocument } from "@/lib/site-render/document";
import { buildRenderModel } from "@/lib/site-render/model";
import { parseSiteSpec } from "@/lib/site-spec/validate";
import { STATUS_TONES } from "./site-spec-editor";
import { SiteSpecSkeleton } from "./site-spec-route";

const VIEWPORTS = {
  phone: { label: "Phone", width: 390, icon: Smartphone },
  tablet: { label: "Tablet", width: 768, icon: Tablet },
  desktop: { label: "Desktop", width: 1280, icon: Monitor },
} as const;
type Viewport = keyof typeof VIEWPORTS;

/**
 * The internal preview of a saved website spec version. The page is drawn by
 * src/lib/site-render as a static document, shown in a sandboxed frame with
 * no permissions: it cannot run scripts, reach the app or load anything from
 * elsewhere. Version, page and language are in the address, so a preview can
 * be reloaded or linked to inside the studio.
 */
export function SitePreviewRoute({ clientId, projectId }: { clientId: string; projectId: string }) {
  const state = useStudio();
  const store = useStudioStore();
  const search = useSearchParams();
  const router = useRouter();
  const [versions, setVersions] = useState<SiteSpecRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const server = state.status === "ready" && state.info.kind === "supabase";

  const fetchVersions = useCallback(() => store.read((r) => (r.listSiteSpecs ? r.listSiteSpecs(projectId) : Promise.resolve([]))), [store, projectId]);
  useEffect(() => {
    if (!server) return;
    let active = true;
    fetchVersions().then(
      (list) => active && setVersions(list),
      (error: unknown) => active && setLoadError(errorMessage(error)),
    );
    return () => {
      active = false;
    };
  }, [server, fetchVersions]);

  if (state.status === "error") return <LoadError message={state.message} />;
  if (state.status === "loading") return <SiteSpecSkeleton />;
  const client = state.snapshot.clients.find((c) => c.id === clientId);
  const project = state.snapshot.projects.find((p) => p.id === projectId && p.clientId === clientId);
  const specHref = `/clients/${encodeURIComponent(clientId)}/projects/${encodeURIComponent(projectId)}/site`;
  if (!client || !project || !isWebsiteProject(project)) {
    return (
      <Surface>
        <EmptyState icon={<SearchX />} title="Project not found" action={<ButtonLink href="/clients">Back to clients</ButtonLink>} />
      </Surface>
    );
  }
  if (!server) {
    return (
      <Surface>
        <EmptyState icon={<FileText />} title="Website specs need a signed-in workspace" description="They are stored on the server with the studio's data." />
      </Surface>
    );
  }
  if (loadError) return <LoadError message={loadError} />;
  if (!versions) return <SiteSpecSkeleton />;

  const wanted = Number(search.get("v"));
  const record = versions.find((v) => v.version === wanted) ?? openSiteSpec(versions) ?? versions[0];
  if (!record) {
    return (
      <Surface>
        <EmptyState icon={<FileText />} title="No website spec to preview yet" action={<ButtonLink href={specHref}>Go to the website spec</ButtonLink>} />
      </Surface>
    );
  }

  const setParam = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(search.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.replace(`?${next.toString()}`, { scroll: false });
  };

  return (
    <Preview
      key={record.id}
      record={record}
      versions={versions}
      title={`${client.name} · ${project.name}`}
      specHref={specHref}
      pageId={search.get("page") ?? undefined}
      locale={search.get("lang") ?? undefined}
      onChange={setParam}
    />
  );
}

function Preview({
  record,
  versions,
  title,
  specHref,
  pageId,
  locale,
  onChange,
}: {
  record: SiteSpecRecord;
  versions: SiteSpecRecord[];
  title: string;
  specHref: string;
  pageId?: string;
  locale?: string;
  onChange: (changes: Record<string, string | null>) => void;
}) {
  const [viewport, setViewport] = useState<Viewport>("desktop");
  const [showMissing, setShowMissing] = useState(record.status === "draft" || record.status === "in_review");
  const [available, setAvailable] = useState(0);
  const frameBox = useRef<HTMLDivElement>(null);

  // The space for the frame, so a wide preview can be scaled down to fit.
  useEffect(() => {
    const box = frameBox.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const parsed = useMemo(() => parseSiteSpec(record.spec), [record.spec]);
  const rendered = useMemo(() => {
    if (!parsed.ok) return null;
    const model = buildRenderModel(parsed.spec, { pageId, locale, showMissing });
    return { model, html: renderPreviewDocument(parsed.spec, model) };
  }, [parsed, pageId, locale, showMissing]);

  const width = VIEWPORTS[viewport].width;
  const scale = available > 0 ? Math.min(1, available / width) : 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <ButtonLink href={specHref} variant="ghost" size="sm" className="self-start">
          <ArrowLeft aria-hidden />
          Back to the website spec
        </ButtonLink>
        <h1 className="text-[24px] leading-tight font-medium tracking-[-0.03em] text-ink">Preview · website spec v{record.version}</h1>
        <div className="flex flex-wrap items-center gap-3 text-[13px] text-ink-subtle">
          <span>{title}</span>
          <StatusLabel tone={STATUS_TONES[record.status]}>{record.status === "approved" ? "Approved" : `${SITE_SPEC_STATUS_LABELS[record.status]} · not published`}</StatusLabel>
          <span>Internal preview. Fonts use system fallbacks; links don&apos;t navigate, so choose pages here.</span>
        </div>
      </div>

      {!rendered ? (
        <LoadError message="This version cannot be previewed because it is not a valid website spec. Open it in the editor to see why." />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <Field id="preview-version" label="Version" className="w-44">
              <Select id="preview-version" value={record.version} onChange={(e) => onChange({ v: e.target.value })}>
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version} · {SITE_SPEC_STATUS_LABELS[v.status]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="preview-page" label="Page" className="w-56">
              <Select id="preview-page" value={rendered.model.page.id} onChange={(e) => onChange({ page: e.target.value })}>
                {rendered.model.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.depth ? `– ${p.title}` : p.title}
                  </option>
                ))}
              </Select>
            </Field>
            {rendered.model.locales.length > 1 ? (
              <Field id="preview-lang" label="Language" className="w-40">
                <Select id="preview-lang" value={rendered.model.lang} onChange={(e) => onChange({ lang: e.target.value })}>
                  {rendered.model.locales.map((l) => (
                    <option key={l.locale} value={l.locale}>
                      {l.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <div role="group" aria-label="Screen size" className="flex gap-1">
              {(Object.keys(VIEWPORTS) as Viewport[]).map((key) => {
                const { label, icon: Icon } = VIEWPORTS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={viewport === key}
                    onClick={() => setViewport(key)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px]",
                      viewport === key ? "border-ink bg-sunken text-ink" : "border-line-strong text-ink-muted hover:text-ink",
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    {label}
                  </button>
                );
              })}
            </div>
            <label className="flex h-9 items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} />
              Show what&apos;s missing
              {rendered.model.missingCount ? <span className="text-ink-subtle">({rendered.model.missingCount})</span> : null}
            </label>
          </div>

          <div ref={frameBox} className="w-full">
            <div className="mx-auto overflow-hidden rounded-[var(--radius-surface)] border border-line bg-white" style={{ width: width * scale, height: "75vh" }}>
              <iframe
                title={`Preview of ${rendered.model.page.title.text || "the page"}`}
                sandbox=""
                srcDoc={rendered.html}
                data-testid="site-preview-frame"
                style={{ width, height: `calc(75vh / ${scale})`, transform: `scale(${scale})`, transformOrigin: "top left", border: 0, display: "block" }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
