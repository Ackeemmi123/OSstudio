"use client";

import { Gauge } from "lucide-react";
import { useState } from "react";
import { useStudioStore } from "@/components/providers/studio-provider";
import { QualityCard } from "@/components/quality/quality-card";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/data/studio-store";
import type { QualityReport } from "@/lib/quality/site-quality";
import type { SiteSpec } from "@/lib/site-spec/schema";

const MAX_ROUNDS = 2;

/** What a rewording can fix: the words, the visitor's essentials and vague links; not weight, titles or structure. */
function fixable(report: QualityReport): string[] {
  return report.groups
    .filter((g) => g.key === "words" || g.key === "visitor" || g.key === "access")
    .flatMap((g) => g.items.filter((i) => !i.ok && (g.key !== "access" || /Links that say only/.test(i.text))).map((i) => `${g.label}: ${i.text}${i.where ? ` (${i.where})` : ""}`));
}

/**
 * The quality gate on the draft as it stands, before anything is built: what
 * a visitor would miss, what sounds like a template, what search engines
 * would not find. Checked when asked, since a draft changes with every word.
 */
export function DraftQuality({ spec, improve }: { spec: SiteSpec | null; /** Asks the AI to fix what rewording can fix; absent where no AI is set up or the spec is not editable. */ improve?: (focus: string[]) => Promise<boolean> }) {
  const store = useStudioStore();
  const [rounds, setRounds] = useState(0);
  const [improving, setImproving] = useState(false);
  const [state, setState] = useState<{ kind: "idle" } | { kind: "checking" } | { kind: "report"; report: QualityReport } | { kind: "missing"; missing: string[] } | { kind: "error"; message: string }>({ kind: "idle" });
  const design = spec?.brand.designSystem;
  if (!spec || !design || design === "template") return null;

  async function check() {
    if (!spec) return;
    setState({ kind: "checking" });
    try {
      const report = await store.read((r) => (r.draftQuality ? r.draftQuality(spec) : Promise.resolve(null)));
      if (!report) setState({ kind: "idle" });
      else if ("missing" in report) setState({ kind: "missing", missing: report.missing });
      else setState({ kind: "report", report });
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="draft-quality">
      <div className="flex flex-wrap items-center gap-3">
        <Button size="xs" onClick={check} disabled={state.kind === "checking"}>
          <Gauge aria-hidden />
          {state.kind === "checking" ? "Checking…" : state.kind === "idle" ? "Check the draft's quality" : "Check again"}
        </Button>
        {state.kind === "idle" ? <span className="text-[12.5px] text-ink-subtle">Scores the pages as a client and a search engine would see them, before anything is built.</span> : null}
      </div>
      {state.kind === "report" ? <QualityCard report={state.report} title="Draft quality" /> : null}
      {state.kind === "report" && improve && fixable(state.report).length ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="xs"
            variant="primary"
            disabled={improving || rounds >= MAX_ROUNDS}
            onClick={async () => {
              setImproving(true);
              const started = await improve(fixable(state.report));
              setImproving(false);
              if (started) setRounds((n) => n + 1);
            }}
          >
            {improving ? "Starting…" : "Improve until ready"}
          </Button>
          <span className="text-[12.5px] text-ink-subtle">
            {rounds >= MAX_ROUNDS
              ? "Two rounds done. Take the proposals under Warmer text, then check again; what is left is for a person."
              : `Claude rewrites what the check found, without adding facts; the proposals come under Warmer text for you to take. About $0.10–0.30.${rounds ? ` Round ${rounds + 1} of ${MAX_ROUNDS}.` : ""}`}
          </span>
        </div>
      ) : null}
      {state.kind === "missing" ? (
        <p className="text-[12.5px] text-ink-muted">The design cannot draw the draft yet: {state.missing.slice(0, 3).join(" ")}</p>
      ) : null}
      {state.kind === "error" ? <p className="text-[12.5px] text-critical">{state.message}</p> : null}
    </div>
  );
}
