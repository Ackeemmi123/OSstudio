import { getInitials } from "@/lib/domain/clients";
import { cn } from "@/lib/cn";

/**
 * Soft tints that sit well with Axivo's blues, one per client so a client is
 * recognised at a glance. Dark text on a light tint keeps 4.5:1 or more.
 */
const TINTS = [
  "bg-[#E3E8F7] text-[#34457A]",
  "bg-[#DDF0EE] text-[#1F5E58]",
  "bg-[#E4EEDD] text-[#3D5A2C]",
  "bg-[#F5ECDC] text-[#7A5522]",
  "bg-[#F8E3DE] text-[#8A3A2A]",
  "bg-[#EEE2F0] text-[#6A3672]",
  "bg-[#DDEDF8] text-[#245A80]",
  "bg-[#F6E1E8] text-[#8A2F52]",
] as const;

/** The same tint for the same client, every time. */
export function tintOf(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export function Avatar({ name, seed, size = "md", className }: { name: string; /** A client's id gives it its own colour. */ seed?: string; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const sizes = {
    xs: "size-5 text-[9.5px]",
    sm: "size-7 text-[11px]",
    md: "size-9 text-xs",
    lg: "size-12 text-[15px]",
  };
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-medium tracking-wide", seed ? tintOf(seed) : "bg-sunken text-ink-muted", sizes[size], className)}
    >
      {getInitials(name)}
    </span>
  );
}
