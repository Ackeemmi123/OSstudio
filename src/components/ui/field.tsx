import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

const CONTROL =
  "w-full rounded-[var(--radius-control)] border bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle/80 " +
  "transition-colors hover:border-ink-subtle/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/15 " +
  "disabled:bg-surface-muted disabled:text-ink-subtle";

function controlClass(invalid: boolean | undefined, className?: string) {
  return cn(CONTROL, invalid ? "border-critical/60" : "border-line-strong", className);
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}

/** Label, control, hint and error, wired together with ids for screen readers. */
export function Field({ id, label, required, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-[13px] font-medium text-ink">
        <span>{label}</span>
        {required ? (
          <span className="text-[11px] font-normal text-ink-subtle">Required</span>
        ) : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[12px] text-critical">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12px] text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, { error, hint }: { error?: string; hint?: ReactNode }) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export function TextInput({ invalid, className, ...props }: ComponentProps<"input"> & { invalid?: boolean }) {
  return <input aria-invalid={invalid || undefined} className={controlClass(invalid, cn("h-9", className))} {...props} />;
}

export function TextArea({ invalid, className, ...props }: ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={controlClass(invalid, cn("min-h-20 resize-y py-2 leading-relaxed", className))}
      {...props}
    />
  );
}

export function Select({ invalid, className, ...props }: ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={controlClass(
        invalid,
        cn(
          "h-9 appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-8",
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2375746c' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
          className,
        ),
      )}
      {...props}
    />
  );
}
