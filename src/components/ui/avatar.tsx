import { getInitials } from "@/lib/domain/clients";
import { cn } from "@/lib/cn";

export function Avatar({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = {
    sm: "size-7 text-[11px]",
    md: "size-9 text-xs",
    lg: "size-12 text-[15px]",
  };
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-sunken font-medium tracking-wide text-ink-muted",
        sizes[size],
        className,
      )}
    >
      {getInitials(name)}
    </span>
  );
}
