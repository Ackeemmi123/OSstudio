"use client";

import { Scale } from "lucide-react";
import { useState } from "react";
import { useStudio } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/field";
import { Tag, type Tone } from "@/components/ui/status";
import { benchmarkResultOf, type AgentRunRecord } from "@/lib/agents/contract";
import { hostOf, type Standing } from "@/lib/benchmark/compare";
import { MAX_COMPETITORS, type BenchmarkResult } from "@/lib/benchmark/result";

const STANDING: Record<Standing, { label: string; tone: Tone }> = {
  ahead: { label: "Ahead", tone: "positive" },
  level: { label: "Level", tone: "neutral" },
  behind: { label: "Behind", tone: "critical" },
  unknown: { label: "Not measured", tone: "neutral" },
};

const shown = (value: boolean | number | null) => (value === null ? "–" : value === true ? "Yes" : value === false ? "No" : String(value));

/**
 * The client's site beside up to three competitors' sites: what a visitor
 * finds on the home page, plain words, and Google's speed scores on a phone.
 * Where a competitor does better, it says what to fix. Uses no AI.
 */
export function CompetitorPanel({ clientId, projectId }: { clientId: string; projectId: string }) {
  const state = useStudio();
  const { run: act, pending, canEdit } = useStudioAction();
  const runs = state.status === "ready" ? state.snapshot.agentRuns.filter((r) => r.taskType === "qa.benchmark" && r.inputs.some((i) => i.type === "project" && i.id === projectId)) : [];
  const latest: AgentRunRecord | undefined = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const previous = (latest?.inputs ?? []).flatMap((i) => (i.type === "artifact" && i.url ? [i.url] : []));
  const [urls, setUrls] = useState<string[]>(() => Array.from({ length: MAX_COMPETITORS }, (_, i) => previous[i] ?? ""));
  if (state.status !== "ready" || state.info.kind !== "supabase") return null;
  const result = benchmarkResultOf(latest);

  async function compare() {
    await act((r) => r.requestBenchmark!(clientId, projectId, urls.filter((u) => u.trim())), "The comparison could not be started.");
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line bg-surface-muted/40 px-4 py-3" data-testid="competitors">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-medium text-ink">Compare with competitors</p>
      </div>
      <p className="text-[12.5px] text-ink-muted">
        Add up to three competitors in the same trade and area. Each home page is read the same way as this site: can a visitor find the phone number, address, hours and prices at once, is there a form, does the text avoid stock phrases. Google measures speed and accessibility on a phone. Only public addresses go to Google; this site&apos;s private review link does not, so its speed is measured once it is published. No AI is used.
      </p>
      {canEdit ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void compare();
          }}
        >
          <div className="grid gap-2 md:grid-cols-3">
            {urls.map((url, i) => (
              <TextInput
                key={i}
                value={url}
                placeholder={i === 0 ? "competitor.fi" : "another-competitor.fi"}
                aria-label={`Competitor ${i + 1}, web address`}
                onChange={(event) => setUrls((current) => current.map((u, j) => (j === i ? event.target.value : u)))}
                maxLength={300}
              />
            ))}
          </div>
          <div>
            <Button size="xs" variant="primary" type="submit" disabled={pending || !urls.some((u) => u.trim())} aria-busy={pending}>
              <Scale aria-hidden />
              {pending ? "Comparing… up to a minute" : latest ? "Compare again" : "Compare"}
            </Button>
          </div>
        </form>
      ) : null}
      {latest?.status === "running" || latest?.status === "queued" ? (
        <p className="text-[12.5px] text-ink-muted">The sites are being read. It takes up to a minute; reload to see the result.</p>
      ) : latest?.status === "failed" ? (
        <p className="text-[12.5px] text-ink-muted">No comparison this time. {latest.error?.message ?? ""}</p>
      ) : result ? (
        <BenchmarkTable result={result} />
      ) : null}
    </div>
  );
}

function BenchmarkTable({ result }: { result: BenchmarkResult }) {
  const { comparison } = result;
  const sites = [result.ours, ...result.competitors];
  const notes = sites.flatMap((site, i) => {
    const name = i === 0 ? "This site" : hostOf(site.url);
    return [site.error ? `${name}: ${site.error}` : null, site.speedNote ? `${name}: ${site.speedNote}` : null].filter((n): n is string => Boolean(n));
  });
  return (
    <div className="flex flex-col gap-3 text-[12.5px] text-ink-muted">
      <p className="text-ink">
        Ahead on {comparison.ahead}, behind on {comparison.behind} of {comparison.rows.filter((r) => r.standing !== "unknown").length} measured.
        <span className="text-ink-subtle"> Measured {new Date(result.measuredAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.</span>
      </p>
      {comparison.fixes.length ? (
        <div>
          <p className="text-ink">To beat them</p>
          <ul className="list-disc pl-5">
            {comparison.fixes.map((fix) => (
              <li key={fix.key}>
                {fix.text} <span className="text-ink-subtle">({fix.by.join(", ")})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-ink">Nothing a competitor does better on these measures.</p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th className="py-1.5 pr-3 font-medium text-ink">What a visitor gets</th>
              <th className="py-1.5 pr-3 font-medium text-ink">This site</th>
              {result.competitors.map((c) => (
                <th key={c.url} className="py-1.5 pr-3 font-medium text-ink">
                  <a href={c.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    {hostOf(c.url)}
                  </a>
                </th>
              ))}
              <th className="py-1.5 font-medium text-ink">This site is</th>
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.key} className="border-b border-line/60">
                <td className="py-1.5 pr-3 text-ink">{row.label}</td>
                {row.values.map((value, i) => (
                  <td key={i} className="py-1.5 pr-3 tabular-nums">
                    {shown(value)}
                  </td>
                ))}
                <td className="py-1.5">
                  <Tag tone={STANDING[row.standing].tone}>{STANDING[row.standing].label}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {notes.length ? (
        <ul className="text-[11.5px] text-ink-subtle">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-[11.5px] text-ink-subtle">
        Read from each home page only. Speed and accessibility are Google PageSpeed scores on a phone and vary a little between measurements.
        {result.competitors.length ? (
          <>
            {" "}
            Full reports:{" "}
            {result.competitors.map((c, i) => (
              <span key={c.url}>
                {i ? ", " : ""}
                <a href={`https://pagespeed.web.dev/analysis?url=${encodeURIComponent(c.url)}`} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  {hostOf(c.url)}
                </a>
              </span>
            ))}
            .
          </>
        ) : null}
      </p>
    </div>
  );
}
