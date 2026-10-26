import { Info } from "lucide-react";
import type { ReactNode } from "react";

/** States plainly what is not built yet, so nothing pretends to work. */
export function PhaseNote({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 flex items-start gap-2 text-[13px] text-ink-subtle">
      <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
