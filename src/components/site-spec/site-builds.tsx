"use client";

import { ExternalLink, Hammer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import type { SiteBuildRecord, SiteSpecRecord } from "@/lib/domain/types";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function state(build: SiteBuildRecord, now: number): "live" | "expired" | "off" {
  if (build.revokedAt) return "off";
  return new Date(build.expiresAt).getTime() <= now ? "expired" : "live";
}

/**
 * Builds this version with its spec's design system and lists its builds,
 * each with a private link to send to the client. Shown only when the spec
 * names a design system that builds; the template only previews.
 */
export function SiteBuilds({ record }: { record: SiteSpecRecord }) {
  const store = useStudioStore();
  const { run, pending, canEdit } = useStudioAction();
  const [builds, setBuilds] = useState<SiteBuildRecord[] | null>(null);
  const [now] = useState(() => Date.now());
  const designSystem = record.spec.brand?.designSystem;

  const load = useCallback(() => store.read((r) => (r.listSiteBuilds ? r.listSiteBuilds(record.id) : Promise.resolve([]))), [store, record.id]);
  useEffect(() => {
    if (!designSystem || designSystem === "template") return;
    let active = true;
    load().then(
      (list) => active && setBuilds(list),
      () => active && setBuilds([]),
    );
    return () => {
      active = false;
    };
  }, [load, designSystem]);

  if (!designSystem || designSystem === "template") return null;

  async function build() {
    const made = await run((r) => r.buildSite!(record), "The site was not built.");
    if (made) setBuilds((list) => [made, ...(list ?? [])]);
  }

  async function turnOff(target: SiteBuildRecord) {
    const done = await run(async (r) => {
      await r.revokeSiteBuild!(target);
      return true;
    }, "The link was not turned off.");
    if (done) setBuilds((list) => (list ?? []).map((b) => (b.id === target.id ? { ...b, revokedAt: new Date().toISOString() } : b)));
  }

  return (
    <section aria-labelledby="site-builds" className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="site-builds" className="text-[15px] font-medium text-ink">
            Build the site
          </h2>
          <p className="text-[13px] text-ink-subtle">Builds v{record.version} with {designSystem} and gives a private link for 30 days, hidden from search engines.</p>
        </div>
        {canEdit ? (
          <Button variant="primary" size="sm" onClick={build} disabled={pending}>
            <Hammer aria-hidden />
            {pending ? "Building…" : "Build site"}
          </Button>
        ) : null}
      </div>
      {builds?.length ? (
        <ul className="flex flex-col divide-y divide-line">
          {builds.map((b) => {
            const status = state(b, now);
            const warnings = b.checks.filter((c) => c.level === "warning");
            return (
              <li key={b.id} className="flex flex-col gap-1 py-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-ink">{DATE.format(new Date(b.createdAt))}</span>
                  <span className="text-ink-subtle">by {b.createdBy}</span>
                  {status === "live" ? (
                    <a href={b.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-2">
                      Open the link <ExternalLink aria-hidden className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-ink-subtle">{status === "off" ? "Link turned off" : "Link expired"}</span>
                  )}
                  {status === "live" ? <span className="text-ink-subtle">until {DATE.format(new Date(b.expiresAt))}</span> : null}
                  {status === "live" && canEdit ? (
                    <Button variant="ghost" size="xs" onClick={() => turnOff(b)} disabled={pending}>
                      Turn off link
                    </Button>
                  ) : null}
                </div>
                {warnings.length ? (
                  <ul className="list-disc pl-5 text-caution">
                    {warnings.map((w) => (
                      <li key={w.message}>{w.message}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : builds ? (
        <p className="text-[13px] text-ink-subtle">No builds of this version yet.</p>
      ) : null}
    </section>
  );
}
