"use client";

import { Sparkles } from "lucide-react";
import { useAgentStatus } from "@/components/agents/use-agent-status";
import { useStudio } from "@/components/providers/studio-provider";
import { Button } from "@/components/ui/button";
import { planResultOf, type AgentRunRecord, type PlanResult } from "@/lib/agents/contract";
import { formatUsd } from "@/lib/agents/pricing";
import { CONTEXT_FIELD_LABELS, PROJECT_STAGE_LABELS } from "@/lib/domain/labels";

/**
 * The coordination agent's suggestions for a new project's starting tasks.
 * Added tasks are offered unticked; leaving out a playbook task is shown on
 * that task (see `removalFor`). Nothing changes until the person ticks or
 * unticks something and creates the project.
 */
export function TaskSuggestions({
  run,
  pending,
  canAsk,
  picked,
  onAsk,
  onToggle,
}: {
  run: AgentRunRecord | null;
  pending: boolean;
  canAsk: boolean;
  picked: ReadonlySet<string>;
  onAsk: () => void;
  onToggle: (title: string) => void;
}) {
  const state = useStudio();
  const supabase = state.status === "ready" && state.info.kind === "supabase";
  const status = useAgentStatus(supabase);
  if (!supabase || status.state === "unavailable") return null;
  const result = planResultOf(run ?? undefined);

  if (!run) {
    return canAsk ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button size="xs" variant="ghost" onClick={onAsk} disabled={pending || status.state !== "available"} aria-busy={pending}>
          <Sparkles aria-hidden />
          {pending ? "Reading the brief…" : "Suggest changes from the brief"}
        </Button>
        <span className="text-[12px] text-ink-subtle">The AI reads the brief only, not the source material or contact details.</span>
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-line bg-surface-muted/40 px-3 py-2.5" data-testid="task-suggestions">
      <p className="text-[11.5px] font-medium tracking-[0.04em] text-ink-subtle uppercase">Suggested from the brief</p>
      {run.status === "needs_input" ? (
        <p className="text-[13px] text-ink-muted">{run.blocker}</p>
      ) : run.status === "failed" || run.status === "cancelled" ? (
        <p className="text-[13px] text-ink-muted">No suggestions this time. {run.error?.message ?? ""}</p>
      ) : run.status === "queued" || run.status === "running" ? (
        <p className="text-[13px] text-ink-muted">Suggestions are already being prepared. Ask again in a moment.</p>
      ) : !result || (result.add.length === 0 && result.remove.length === 0) ? (
        <p className="text-[13px] text-ink-muted">No changes suggested: the usual tasks fit this brief.</p>
      ) : (
        <>
          {result.add.map((task) => (
            <label key={task.title} className="flex items-start gap-2 text-[13.5px] text-ink">
              <input type="checkbox" checked={picked.has(task.title)} onChange={() => onToggle(task.title)} className="mt-0.5 size-4 accent-[var(--color-primary)]" />
              <span>
                {task.title}
                <span className="block text-[12px] text-ink-subtle">
                  {PROJECT_STAGE_LABELS[task.stage]} · from {CONTEXT_FIELD_LABELS[task.basedOn].toLocaleLowerCase()}: {task.reason}
                </span>
              </span>
            </label>
          ))}
          {result.remove.length ? <p className="text-[12px] text-ink-subtle">Suggestions to leave out a usual task are shown on that task above.</p> : null}
        </>
      )}
      <p className="text-[11.5px] text-ink-subtle">
        Suggestions only: none is added unless you tick it.
        {run.runner === "fixture" ? " Produced by the test provider, not by an AI model." : ""}
        {run.costMicros !== null && run.runner !== "fixture" ? ` Estimated cost ${formatUsd(run.costMicros)}.` : ""}
      </p>
    </div>
  );
}

/** Why the suggestions say to leave out a playbook task, if they do. */
export function removalFor(result: PlanResult | null, title: string): string | null {
  return result?.remove.find((item) => item.title === title)?.reason ?? null;
}
