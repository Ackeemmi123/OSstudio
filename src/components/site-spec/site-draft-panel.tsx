"use client";

import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useAgentStatus } from "@/components/agents/use-agent-status";
import { useStudio } from "@/components/providers/studio-provider";
import { useStudioAction } from "@/components/providers/use-studio-action";
import { Button } from "@/components/ui/button";
import { siteDraftResultOf, type AgentRunRecord } from "@/lib/agents/contract";
import { formatUsd } from "@/lib/agents/pricing";
import { SiteDraftReview } from "./site-draft-review";
import type { SpecEditing } from "./site-spec-editor";

/**
 * Asks the Design agent to draft the whole website from the client's
 * material, and shows what came back. The draft is stored on the run; the
 * spec below does not change until a person reviews the draft and takes
 * the sections they choose.
 */
export function SiteDraftPanel({ clientId, projectId, editing }: { clientId: string; projectId: string; editing: SpecEditing }) {
  const [reviewing, setReviewing] = useState(false);
  const state = useStudio();
  const supabase = state.status === "ready" && state.info.kind === "supabase";
  const status = useAgentStatus(supabase);
  const { run: act, pending, canEdit } = useStudioAction();
  if (!supabase || status.state === "unavailable" || state.status !== "ready") return null;
  const runs = state.snapshot.agentRuns.filter((r) => r.taskType === "design.site_draft" && r.inputs.some((i) => i.type === "project" && i.id === projectId));
  const latest: AgentRunRecord | undefined = [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const result = siteDraftResultOf(latest);

  async function ask(force: boolean) {
    await act((r) => r.requestSiteDraft!(clientId, projectId, { force }), "The draft could not be started.");
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-surface-muted/40 px-4 py-3" data-testid="site-draft">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13.5px] font-medium text-ink">Draft from the client&apos;s material</p>
        {canEdit ? (
          <Button size="xs" variant={latest ? "ghost" : "primary"} onClick={() => ask(Boolean(latest))} disabled={pending || status.state !== "available"} aria-busy={pending}>
            <Sparkles aria-hidden />
            {pending ? "Drafting… this takes a few minutes" : latest ? "Draft again" : "Draft the website"}
          </Button>
        ) : null}
      </div>
      {!latest ? (
        <p className="text-[12.5px] text-ink-muted">Claude reads the brief, the texts and the kept files under Source material and proposes every page and text, each with the line it comes from. The spec below does not change until you review the draft.</p>
      ) : latest.status === "queued" || latest.status === "running" ? (
        <p className="text-[12.5px] text-ink-muted">A draft is being written. It takes a few minutes; reload to see it.</p>
      ) : latest.status === "needs_input" ? (
        <p className="text-[12.5px] text-ink-muted">{latest.blocker}</p>
      ) : latest.status === "failed" || latest.status === "cancelled" ? (
        <p className="text-[12.5px] text-ink-muted">No draft this time. {latest.error?.message ?? ""}</p>
      ) : result ? (
        <div className="flex flex-col gap-2 text-[12.5px] text-ink-muted">
          <p>{result.summary}</p>
          <p>
            {result.spec.pages.length} pages: {result.spec.pages.map((p) => Object.values(p.title).find(Boolean) || p.id).join(", ")}. {Object.keys(result.provenance).length} texts with a source;{" "}
            {result.dropped.length} left out for lack of one.
            {result.skippedFiles.length ? ` ${result.skippedFiles.length} files not read: ${result.skippedFiles.map((f) => `${f.title} (${f.reason})`).join("; ")}` : ""}
          </p>
          {result.questions.length ? (
            <div>
              <p className="text-ink">Questions for the client</p>
              <ul className="list-disc pl-5">
                {result.questions.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {reviewing ? (
            <SiteDraftReview result={result} editing={editing} onDone={() => setReviewing(false)} />
          ) : canEdit ? (
            <div>
              <Button size="xs" variant="primary" onClick={() => setReviewing(true)}>
                Review the draft
              </Button>
            </div>
          ) : null}
        </div>
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
