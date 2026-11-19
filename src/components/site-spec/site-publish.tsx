"use client";

import { Globe, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import type { DomainSetup, SitePublicationRecord, SiteSpecRecord } from "@/lib/domain/types";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Puts an approved version on the hosting and the client's domain, shows
 * what to add at the domain's DNS, and lists earlier publications so one can
 * be restored. The server checks the rules again: an approved spec, the
 * client's approval on the review link, image rights, a contact for forms.
 */
export function SitePublish({ record }: { record: SiteSpecRecord }) {
  const store = useStudioStore();
  const { run, pending, canEdit } = useStudioAction();
  const [list, setList] = useState<SitePublicationRecord[] | null>(null);
  const [domain, setDomain] = useState("");
  const [setup, setSetup] = useState<DomainSetup | null>(null);
  const designSystem = record.spec.brand?.designSystem;

  const load = useCallback(() => store.read((r) => (r.listPublications ? r.listPublications(record.projectId) : Promise.resolve([]))), [store, record.projectId]);
  useEffect(() => {
    if (!designSystem || designSystem === "template") return;
    let active = true;
    load().then(
      (found) => {
        if (!active) return;
        setList(found);
        const live = found.find((p) => p.status === "live");
        if (live?.domain) setDomain((d) => d || live.domain!);
      },
      () => active && setList([]),
    );
    return () => {
      active = false;
    };
  }, [load, designSystem]);

  if (!designSystem || designSystem === "template") return null;
  const live = list?.find((p) => p.status === "live");

  async function publish() {
    if (!window.confirm(`Publish version ${record.version}${domain.trim() ? ` on ${domain.trim()}` : ""}? It will be public and findable by search engines.`)) return;
    const done = await run((r) => r.publishSite!(record, domain), "The site was not published.");
    if (done) {
      setSetup(done.domain);
      setList(await load().catch(() => list));
    }
  }

  async function restore(target: SitePublicationRecord) {
    if (!window.confirm(`Make version ${target.specVersion} from ${DATE.format(new Date(target.createdAt))} live again?`)) return;
    const done = await run(async (r) => {
      await r.restorePublication!(target);
      return true;
    }, "The earlier version was not restored.");
    if (done) setList(await load().catch(() => list));
  }

  async function check(target: SitePublicationRecord) {
    const found = await run((r) => r.domainStatus!(target), "The domain could not be checked.");
    if (found) setSetup(found);
  }

  return (
    <section aria-labelledby="site-publish" className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-line bg-surface p-4">
      <div>
        <h2 id="site-publish" className="text-[15px] font-medium text-ink">
          Publish
        </h2>
        <p className="text-[13px] text-ink-subtle">
          Puts version {record.version} on the client&apos;s domain, public and with working forms. It needs the spec approved here, the client&apos;s approval on the review link, approved image rights and a contact e-mail for the forms.
        </p>
      </div>
      {live ? (
        <p className="text-[13px] text-ink">
          Live: version {live.specVersion},{" "}
          <a href={live.url} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            {live.url.replace(/^https:\/\//, "")}
          </a>{" "}
          <span className="text-ink-subtle">· {DATE.format(new Date(live.createdAt))} by {live.publishedBy}</span>
          {live.domain && canEdit ? (
            <Button size="xs" variant="ghost" onClick={() => check(live)} disabled={pending} className="ml-2">
              Check the domain
            </Button>
          ) : null}
        </p>
      ) : list ? (
        <p className="text-[13px] text-ink-subtle">Not published yet.</p>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[13px] text-ink">
            Domain
            <TextInput value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="forening.fi (optional)" className="w-64" disabled={pending} />
          </label>
          <Button variant="primary" size="sm" onClick={publish} disabled={pending}>
            <Globe aria-hidden />
            {pending ? "Publishing…" : live ? `Publish version ${record.version}` : "Publish"}
          </Button>
        </div>
      ) : null}
      {setup ? (
        <div className="rounded-[var(--radius-control)] border border-line px-3 py-2 text-[13px]">
          {setup.ready ? (
            <p className="text-positive">{setup.domain} points at the site and has a certificate.</p>
          ) : (
            <>
              <p className="text-ink">{setup.domain} does not point at the site yet. Add this at the domain&apos;s DNS, then check again (it can take up to a day):</p>
              <table className="mt-2 text-[12.5px]">
                <thead>
                  <tr className="text-left text-ink-subtle">
                    <th className="pr-4 font-normal">Type</th>
                    <th className="pr-4 font-normal">Name</th>
                    <th className="font-normal">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {setup.records.map((r) => (
                    <tr key={`${r.type}-${r.value}`}>
                      <td className="pr-4">{r.type}</td>
                      <td className="pr-4">{r.name}</td>
                      <td className="font-mono">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {setup.records.length === 0 ? <p className="mt-1 text-ink-subtle">The hosting did not name a record; check its dashboard for this domain.</p> : null}
            </>
          )}
        </div>
      ) : null}
      {list && list.filter((p) => p.status !== "live").length ? (
        <details className="text-[13px]">
          <summary className="cursor-pointer text-ink">Earlier publications</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {list
              .filter((p) => p.status !== "live")
              .map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2 text-ink-muted">
                  Version {p.specVersion} · {DATE.format(new Date(p.createdAt))} by {p.publishedBy}
                  {canEdit ? (
                    <Button size="xs" variant="ghost" onClick={() => restore(p)} disabled={pending}>
                      <RotateCcw aria-hidden />
                      Restore
                    </Button>
                  ) : null}
                </li>
              ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
