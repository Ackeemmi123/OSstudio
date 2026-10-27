import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Surface({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-[var(--radius-surface)] border border-line bg-surface", className)} {...props} />;
}

/** A titled block on a page. The heading sits above the content instead of inside a card header. */
export function Section({
  title,
  count,
  action,
  id,
  className,
  children,
}: {
  title: string;
  count?: number;
  action?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-20", className)}>
      <div className="mb-3 flex min-h-8 items-center justify-between gap-4">
        <h2 id={headingId} className="flex items-baseline gap-2 text-[15.5px] font-medium tracking-[-0.015em] text-ink">
          {title}
          {count !== undefined ? <span className="text-[13px] font-normal tabular-nums text-ink-subtle">{count}</span> : null}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-tight font-medium tracking-[-0.032em] text-ink">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      {icon ? (
        <div className="mb-3 flex size-9 items-center justify-center rounded-full bg-sunken text-ink-subtle [&_svg]:size-4">{icon}</div>
      ) : null}
      <p className="text-sm font-medium text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-ink-subtle">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded bg-sunken", className)} />;
}

/** Restrained marker for values that have not been recorded. */
export function NotProvided({ children = "Not provided" }: { children?: ReactNode }) {
  return <span className="text-ink-subtle">{children}</span>;
}
