import { getInitials } from "@/lib/domain/clients";
import { cn } from "@/lib/cn";

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = {
    sm: "size-7 text-[11px]",
    md: "size-9 text-xs",
    lg: "size-14 text-base",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-accent-soft font-medium tracking-wide text-accent-strong",
        sizes[size],
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
