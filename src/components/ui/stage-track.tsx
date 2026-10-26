import { cn } from "@/lib/cn";
import { PROJECT_STAGE_LABELS } from "@/lib/domain/labels";
import { PROJECT_STAGES, type ProjectStage } from "@/lib/domain/types";

/** Compact indicator of where a project sits in the studio's delivery stages. */
export function StageTrack({ stage, className }: { stage: ProjectStage; className?: string }) {
  const current = PROJECT_STAGES.indexOf(stage);
  return (
    <div
      className={cn("flex items-center gap-[3px]", className)}
      role="img"
      aria-label={`Stage ${current + 1} of ${PROJECT_STAGES.length}: ${PROJECT_STAGE_LABELS[stage]}`}
      title={PROJECT_STAGES.map((s) => PROJECT_STAGE_LABELS[s]).join(" → ")}
    >
      {PROJECT_STAGES.map((s, index) => (
        <span
          key={s}
          className={cn(
            "h-1 w-3.5 rounded-full",
            index < current ? "bg-accent/60" : index === current ? "bg-accent-strong" : "bg-line-strong/70",
          )}
        />
      ))}
    </div>
  );
}

export function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1 w-16 overflow-hidden rounded-full bg-line-strong/60"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={`${done} of ${total} tasks done`}
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] tabular-nums text-ink-subtle">
        {done}/{total}
      </span>
    </div>
  );
}
