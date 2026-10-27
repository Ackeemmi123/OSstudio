import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "xs" | "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary border border-primary hover:bg-primary-hover hover:border-primary-hover disabled:opacity-50",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-accent hover:bg-sunken disabled:text-ink-subtle",
  ghost: "text-ink-muted hover:text-ink hover:bg-sunken border border-transparent disabled:text-ink-subtle",
};

const SIZES: Record<Size, string> = {
  xs: "h-7 px-2 text-[12.5px] gap-1 [&_svg]:size-3.5",
  sm: "h-8 px-2.5 text-[13px] gap-1.5 [&_svg]:size-4",
  md: "h-9 px-3.5 text-sm gap-2 [&_svg]:size-4",
};

export function buttonClasses(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap",
    "transition-colors duration-150 disabled:cursor-not-allowed [&_svg]:shrink-0",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant, size, className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...props} />;
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ variant, size, className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...props} />;
}

/** Square icon-only button. Always pass an accessible `label`. */
export function IconButton({
  label,
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-[var(--radius-control)] text-ink-muted",
        "transition-colors hover:bg-sunken hover:text-ink [&_svg]:size-[17px]",
        className,
      )}
      {...props}
    />
  );
}
