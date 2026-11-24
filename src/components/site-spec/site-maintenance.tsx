"use client";

import { Activity, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { Field, TextInput } from "@/components/ui/field";
import { StatusLabel } from "@/components/ui/status";
import { useToast } from "@/components/ui/toast";
import type { SiteMaintenance as Maintenance } from "@/lib/data/repository";
import { errorMessage } from "@/lib/data/studio-store";

const WHEN = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * A live site's upkeep: the morning health check, and the monthly report to
 * the client. The report is off until a member turns it on and says who gets
 * it; it can be read first and sent by hand.
 */
export function SiteMaintenance({ projectId, clientId }: { projectId: string; clientId: string }) {
  const store = useStudioStore();
  const state = useStudio();
  const toast = useToast();
  const { run, pending, canEdit } = useStudioAction();
  const [data, setData] = useState<Maintenance | null>(null);
  const [to, setTo] = useState("");
  const [preview, setPreview] = useState<{ subject: string; text: string } | null>(null);
  const [making, setMaking] = useState(false);
  const clientEmail = state.status === "ready" ? (state.snapshot.clients.find((c) => c.id === clientId)?.email ?? "") : "";

  useEffect(() => {
    let active = true;
    store.read((r) => (r.siteMaintenance ? r.siteMaintenance(projectId) : Promise.resolve(null))).then(
      (found) => {
        if (!active || !found) return;
        setData(found);
        setTo(found.reportTo ?? clientEmail);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [store, projectId, clientEmail]);

  if (!data) return null;

  async function save(enabled: boolean) {
    const done = await run(async (r) => {
      await r.saveSiteMaintenance!(projectId, enabled, to.trim() || null);
      return true;
    }, "The report setting was not saved.");
    if (done) {
      setData((d) => (d ? { ...d, reportEnabled: enabled, reportTo: to.trim() || null } : d));
      toast.success(enabled ? `The monthly report goes to ${to.trim()} on the 1st of each month.` : "The monthly report is off.");
    }
  }

  async function make(send: boolean) {
    if (send && !window.confirm(`Send this month's report so far to ${data!.reportTo} now?`)) return;
    setMaking(true);
    try {
      const report = await store.read((r) => r.siteReport!(projectId, send));
      setPreview(report);
      if (report.sent) toast.success(`Report sent to ${report.to}.`);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setMaking(false);
    }
  }

  const check = data.lastCheck;
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-surface)] border border-line bg-surface p-4" aria-labelledby="site-maintenance" data-testid="site-maintenance">
      <div>
        <h2 id="site-maintenance" className="flex items-center gap-2 text-[15px] font-medium text-ink">
          <Activity aria-hidden className="size-4" />
          Maintenance
        </h2>
        <p className="text-[13px] text-ink-subtle">Every morning Studio OS checks the live site, its certificate and www, and e-mails you at once if something is wrong.</p>
      </div>
      {check ? (
        <div className="flex flex-col gap-1 text-[13px]">
          <StatusLabel tone={check.ok ? "positive" : "critical"}>
            {check.ok ? "All well" : "Needs a look"} · checked {WHEN.format(new Date(check.checkedAt))}
            {check.certDaysLeft !== null ? ` · certificate valid ${check.certDaysLeft} more days` : ""}
          </StatusLabel>
          {check.problems.length ? (
            <ul className="list-disc pl-5 text-critical">
              {check.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-ink-subtle">The first check runs tomorrow morning.</p>
      )}

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <p className="text-[13.5px] font-medium text-ink">Monthly report to the client</p>
        <p className="text-[12.5px] text-ink-subtle">On the 1st: whether the site stayed up, its speed and accessibility on a phone, our quality score, how many form messages came (never their content) and what changed. In the site&apos;s language, from your studio.</p>
        <div className="flex flex-wrap items-end gap-2">
          <Field id="report-to" label="Sent to" className="min-w-64 flex-1">
            <TextInput id="report-to" type="email" value={to} maxLength={200} disabled={!canEdit || pending} onChange={(e) => setTo(e.target.value)} placeholder="the client's e-mail" />
          </Field>
          {canEdit ? (
            data.reportEnabled ? (
              <>
                {to.trim() !== (data.reportTo ?? "") ? (
                  <Button size="sm" onClick={() => save(true)} disabled={pending || !to.trim()}>
                    Save
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => save(false)} disabled={pending}>
                  Turn off
                </Button>
              </>
            ) : (
              <Button size="sm" variant="primary" onClick={() => save(true)} disabled={pending || !to.trim()}>
                Turn on the monthly report
              </Button>
            )
          ) : null}
        </div>
        <StatusLabel tone={data.reportEnabled ? "positive" : "neutral"}>{data.reportEnabled ? `On: goes to ${data.reportTo} on the 1st of each month` : "Off: nothing is sent to the client"}</StatusLabel>
        <div className="flex flex-wrap gap-2">
          <Button size="xs" onClick={() => make(false)} disabled={making}>
            {making ? "Measuring… about half a minute" : "Show this month's report so far"}
          </Button>
          {canEdit && data.reportEnabled ? (
            <Button size="xs" variant="ghost" onClick={() => make(true)} disabled={making}>
              <Send aria-hidden />
              Send it now
            </Button>
          ) : null}
        </div>
        {preview ? (
          <div className="rounded-[var(--radius-control)] border border-line bg-surface-muted px-3 py-2.5 text-[13px]">
            <p className="font-medium text-ink">{preview.subject}</p>
            <pre className="mt-1 font-sans whitespace-pre-wrap text-ink-muted">{preview.text}</pre>
          </div>
        ) : null}
      </div>
    </section>
  );
}
