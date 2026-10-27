import { cn } from "@/lib/cn";

export type Tone = "positive" | "caution" | "critical" | "info" | "neutral" | "accent";

const DOT: Record<Tone, string> = {
  positive: "bg-positive",
  caution: "bg-caution",
  critical: "bg-critical",
  info: "bg-info",
  neutral: "bg-neutral",
  accent: "bg-accent",
};

/** Small dot plus label. Status is always conveyed by text, never by color alone. */
export function StatusLabel({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-ink-muted", className)}>
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  );
}

const TAG: Record<Tone, string> = {
  positive: "text-positive border-positive/25 bg-positive/[0.06]",
  caution: "text-caution border-caution/25 bg-caution/[0.06]",
  critical: "text-critical border-critical/25 bg-critical/[0.06]",
  info: "text-info border-info/25 bg-info/[0.06]",
  neutral: "text-ink-muted border-line-strong bg-surface-muted",
  accent: "text-ink border-line-strong bg-accent-soft",
};

export function Tag({ tone = "neutral", children, className, title }: { tone?: Tone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium whitespace-nowrap",
        TAG[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
