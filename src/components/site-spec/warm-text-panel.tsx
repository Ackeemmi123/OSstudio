"use client";

import { MessageCircleHeart } from "lucide-react";
import { useState } from "react";
import { useAgentStatus } from "@/components/agents/use-agent-status";
import { useStudio } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { warmTextResultOf, type AgentRunRecord } from "@/lib/agents/contract";
import { formatUsd } from "@/lib/agents/pricing";
import { applyWarmText, type WarmTextResult } from "@/lib/agents/warm-text";
import type { SiteSpec } from "@/lib/site-spec/schema";
import type { SpecEditing } from "./site-spec-editor";

/**
 * The last pass over a spec's texts: the Design agent proposes warmer
 * wordings in the client's own voice, each beside the text it would replace.
 * Nothing changes until a person ticks proposals and takes them; facts are
 * never changed, and proposals that add any are left out by the checks.
 */
export function WarmTextPanel({ clientId, projectId, specId, spec, editing }: { clientId: string; projectId: string; specId: string; spec: SiteSpec; editing: SpecEditing }) {
  const state = useStudio();
  const supabase = state.status === "ready" && state.info.kind === "supabase";
  const status = useAgentStatus(supabase);
  const { run: act, pending, canEdit } = useStudioAction();
  if (!supabase || status.state === "unavailable" || state.status !== "ready") return null;
  const runs = state.snapshot.agentRuns.filter((r) => r.taskType === "design.warm_text" && r.inputs.some((i) => i.type === "artifact" && i.id === specId));
  const latest: AgentRunRecord | undefined = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const result = warmTextResultOf(latest);

  async function ask(force: boolean) {
    await act((r) => r.requestWarmText!(clientId, projectId, specId, { force }), "The text pass could not be started.");
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-surface-muted/40 px-4 py-3" data-testid="warm-text">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-medium text-ink">Warmer text</p>
        {canEdit ? (
          <Button size="xs" variant="ghost" onClick={() => ask(Boolean(latest))} disabled={pending || status.state !== "available"} aria-busy={pending}>
            <MessageCircleHeart aria-hidden />
            {pending ? "Reading the texts… about a minute" : latest ? "Propose again" : "Propose warmer wordings"}
          </Button>
        ) : null}
      </div>
      {!latest ? (
        <p className="text-[12.5px] text-ink-muted">
          A last pass when the texts are in place. Claude reads the saved texts of the main pages beside the client&apos;s own writing and proposes wordings that sound more like them. You see each proposal beside the old text and tick the ones to take. Facts are never changed; names, prices, quotes, contact details and legal pages are left out.
        </p>
      ) : latest.status === "queued" || latest.status === "running" ? (
        <p className="text-[12.5px] text-ink-muted">The texts are being read. It takes about a minute; reload to see the proposals.</p>
      ) : latest.status === "needs_input" ? (
        <p className="text-[12.5px] text-ink-muted">{latest.blocker}</p>
      ) : latest.status === "failed" || latest.status === "cancelled" ? (
        <p className="text-[12.5px] text-ink-muted">No proposals this time. {latest.error?.message ?? ""}</p>
      ) : result ? (
        <WarmTextReview result={result} spec={spec} editing={editing} />
      ) : null}
      {latest ? (
        <p className="text-[11.5px] text-ink-subtle">
          Proposals only.
          {latest.runner === "fixture" ? " Produced by the test provider, not by an AI model." : ""}
          {latest.costMicros !== null && latest.runner !== "fixture" ? ` Estimated cost ${formatUsd(latest.costMicros)}.` : ""}
        </p>
      ) : null}
    </div>
  );
}

function WarmTextReview({ result, spec, editing }: { result: WarmTextResult; spec: SiteSpec; editing: SpecEditing }) {
  const toast = useToast();
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set());
  const [taken, setTaken] = useState<ReadonlySet<string>>(new Set());
  const open = result.suggestions.filter((s) => !taken.has(s.path));

  function toggle(path: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function take() {
    const picked = open.filter((s) => chosen.has(s.path));
    // Counted on a copy of the spec as it is now; the edit itself runs when React applies it.
    const outcome = applyWarmText(structuredClone(spec), picked);
    editing.change((draft) => void applyWarmText(draft, picked));
    setTaken((current) => new Set([...current, ...picked.map((s) => s.path)]));
    setChosen(new Set());
    if (outcome.changedSince) toast.success(`${outcome.taken} taken. ${outcome.changedSince} left as they are: the text was changed after the pass read it.`);
    else toast.success(`${outcome.taken} ${outcome.taken === 1 ? "text" : "texts"} taken. Check them in the preview.`);
  }

  return (
    <div className="flex flex-col gap-2 text-[12.5px] text-ink-muted">
      <p>{result.summary}</p>
      <p>
        {result.suggestions.length} proposals for version {result.specVersion}
        {result.dropped.length ? `; ${result.dropped.length} left out by the checks` : ""}.
      </p>
      {open.length ? (
        <>
          <ul className="flex flex-col">
            {open.map((s) => (
              <li key={s.path} className="grid gap-x-4 gap-y-1 border-t border-line/60 py-2 first:border-t-0 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={chosen.has(s.path)}
                  onChange={() => toggle(s.path)}
                  disabled={!editing.editable}
                  aria-label={`Take the proposal for ${s.name}`}
                />
                <div className="min-w-0">
                  <p className="text-[11px] tracking-[0.04em] text-ink-subtle uppercase">{s.name} · now</p>
                  <p className="text-[13px] whitespace-pre-wrap text-ink-muted line-through decoration-line-strong">{s.before}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] tracking-[0.04em] text-ink-subtle uppercase">Proposed</p>
                  <p className="text-[13px] whitespace-pre-wrap text-ink">{s.after}</p>
                  <p className="mt-1 text-[12px] text-ink-subtle">{s.reason}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="primary" onClick={take} disabled={!editing.editable || chosen.size === 0}>
              Take {chosen.size || ""} ticked
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setChosen(new Set(open.map((s) => s.path)))} disabled={!editing.editable}>
              Tick all
            </Button>
          </div>
        </>
      ) : result.suggestions.length ? (
        <p>All proposals are taken. Ask again after more changes, if you like.</p>
      ) : (
        <p>Nothing to propose: the texts already sound like the client.</p>
      )}
      {result.dropped.length ? (
        <details>
          <summary className="cursor-pointer text-ink-subtle">Left out by the checks</summary>
          <ul className="list-disc pl-5">
            {result.dropped.map((d, i) => (
              <li key={i}>
                {d.name}: {d.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
