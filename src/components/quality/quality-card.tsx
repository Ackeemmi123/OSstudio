import type { QualityReport } from "@/lib/quality/site-quality";

const VERDICT: Record<QualityReport["verdict"], { label: string; tone: string; bar: string }> = {
  ready: { label: "Ready for the client", tone: "text-positive", bar: "bg-positive" },
  fix_first: { label: "Worth fixing first", tone: "text-caution", bar: "bg-caution" },
  not_ready: { label: "Not ready for the client", tone: "text-critical", bar: "bg-critical" },
};

/** The quality gate's verdict on a build: a score, and what to fix, most important first. */
export function QualityCard({ report, title }: { report: QualityReport; title?: string }) {
  const verdict = VERDICT[report.verdict];
  const problems = report.groups.flatMap((g) => g.items.filter((i) => !i.ok).map((i) => ({ ...i, group: g.label }))).sort((a, b) => b.weight - a.weight);
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-surface-muted px-3 py-2.5" data-testid="quality-card">
      <div className="flex flex-wrap items-center gap-3">
        {title ? <span className="text-[13px] font-medium text-ink">{title}</span> : null}
        <span className="text-[20px] leading-none font-medium tabular-nums text-ink">{report.score}</span>
        <span className="text-[12px] text-ink-subtle">of 100</span>
        <span className={`text-[13px] font-medium ${verdict.tone}`}>{verdict.label}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-line-strong/60" aria-hidden>
        <div className={`h-full rounded-full ${verdict.bar}`} style={{ width: `${report.score}%` }} />
      </div>
      {problems.length ? (
        <ul className="flex flex-col gap-1 text-[12.5px] text-ink">
          {problems.slice(0, 8).map((p, i) => (
            <li key={i}>
              <span className="text-ink-subtle">{p.group}: </span>
              {p.text}
              {p.where ? <span className="text-ink-subtle"> · {p.where}</span> : null}
            </li>
          ))}
          {problems.length > 8 ? <li className="text-ink-subtle">and {problems.length - 8} more</li> : null}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-muted">Nothing found: a visitor gets what they need, the words sound like a person, and the pages are accessible, findable and light. Look at it on a phone before sending.</p>
      )}
    </div>
  );
}
