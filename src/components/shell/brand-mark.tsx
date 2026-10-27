import Image from "next/image";
import { BRAND } from "@/lib/brand";

/** Company and product name. Uses the official logo once one is configured in src/lib/brand.ts. */
export function BrandMark() {
  return (
    <span className="flex items-center gap-2.5 whitespace-nowrap">
      {BRAND.logo ? (
        <Image src={BRAND.logo.src} width={BRAND.logo.width} height={BRAND.logo.height} alt={BRAND.company} className="h-5 w-auto" />
      ) : (
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-ink">{BRAND.company}</span>
      )}
      <span aria-hidden className="hidden h-4 w-px bg-line-strong sm:block" />
      <span className="hidden text-[14px] tracking-[-0.01em] text-ink-muted sm:inline">{BRAND.product}</span>
    </span>
  );
}
