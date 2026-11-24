"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useStudio, useStudioStore } from "@/components/providers/studio-provider";
import { Button, ButtonLink } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { DELIVERY_STEPS, deliveryOf, type Delivery, type DeliveryFacts } from "@/lib/domain/delivery";
import { useNow } from "@/lib/use-now";

/**
 * Where every website project stands. Read when the page opens and again
 * after every change made through the studio (approving, building,
 * publishing), which refreshes the snapshot. Null while loading, and an empty
 * map where the workspace has no website specs (the local demo).
 */
export function useDeliveries(): Map<string, Delivery> | null {
  const store = useStudioStore();
  const state = useStudio();
  const snapshot = state.status === "ready" ? state.snapshot : null;
  const now = useNow();
  const [facts, setFacts] = useState<DeliveryFacts[] | null>(null);
  useEffect(() => {
    let active = true;
    store.read((r) => (r.listDeliveryFacts ? r.listDeliveryFacts() : Promise.resolve([]))).then(
      (found) => active && setFacts(found),
      () => active && setFacts([]),
    );
    return () => {
      active = false;
    };
  }, [store, snapshot]);
  return useMemo(() => (facts && now ? new Map(facts.map((f) => [f.projectId, deliveryOf(f, now)])) : null), [facts, now]);
}

/** The five steps from spec to live, with the one reached marked. Text carries the state too. */
export function DeliveryTrack({ delivery, className, labels = "all" }: { delivery: Delivery; className?: string; labels?: "all" | "current" }) {
  const current = DELIVERY_STEPS[delivery.step];
  const live = delivery.stage === "live";
  return (
    <div className={cn("flex flex-col gap-1.5", className)} data-testid="delivery-track">
      <ol className="flex items-center gap-1" aria-label={`Website progress: ${live ? "live" : current.label}, step ${delivery.step + 1} of ${DELIVERY_STEPS.length}`}>
        {DELIVERY_STEPS.map((step, i) => {
          const done = i < delivery.step || live;
          const here = i === delivery.step && !live;
          return (
            <li key={step.key} className="flex-1" aria-current={here ? "step" : undefined}>
              <span aria-hidden className={cn("block h-1.5 rounded-full transition-colors duration-500", done ? "bg-positive" : here ? "bg-positive/40" : "bg-line-strong/70")} />
              <span className="sr-only">
                {step.label}
                {done ? ", done" : here ? ", now" : ""}
              </span>
            </li>
          );
        })}
      </ol>
      {labels === "current" ? (
        <p aria-hidden className="text-[11px] text-ink-subtle">
          {live ? "Live" : current.label} · step {delivery.step + 1} of {DELIVERY_STEPS.length}
        </p>
      ) : (
      <ol aria-hidden className="hidden grid-cols-5 gap-1 text-[11px] text-ink-subtle sm:grid">
        {DELIVERY_STEPS.map((step, i) => (
          <li key={step.key} className={cn("truncate", i === delivery.step && "font-medium text-ink")}>
            {step.label}
          </li>
        ))}
      </ol>
      )}
    </div>
  );
}

/** Copies the full review link, so it can be pasted into an e-mail to the client. */
export function CopyReviewLink({ link, variant = "secondary" }: { link: string; variant?: "primary" | "secondary" }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  async function copy() {
    const url = new URL(link, window.location.origin).toString();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Review link copied. Paste it into your e-mail to the client.");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(`Copying did not work here. The link is ${url}`);
    }
  }
  return (
    <Button size="xs" variant={variant} onClick={copy}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      Copy review link
    </Button>
  );
}

/** The next step for one website, with the actions it needs. `href` opens the spec; compact leaves that button out. */
export function DeliveryNext({ delivery, href, compact = false }: { delivery: Delivery; href?: string; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <p className={cn("text-[14px]", delivery.stage === "live" ? "text-positive" : "text-ink")}>
          {delivery.stage === "live" ? null : <span className="text-ink-subtle">Next: </span>}
          <span className="font-medium">{delivery.next}</span>
        </p>
        {delivery.detail ? <p className="mt-0.5 text-[12.5px] text-ink-subtle">{delivery.detail}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {delivery.reviewLink ? <CopyReviewLink link={delivery.reviewLink} /> : null}
        {delivery.liveUrl ? (
          <a href={delivery.liveUrl} target="_blank" rel="noopener" className="inline-flex items-center gap-1 rounded-sm text-[12.5px] text-ink-muted hover:text-ink">
            Open the live site
            <ExternalLink aria-hidden className="size-3.5" />
          </a>
        ) : null}
        {href && !compact ? (
          <ButtonLink href={href} size="xs" variant={delivery.waitingOnClient || delivery.stage === "live" ? "secondary" : "primary"}>
            {delivery.stage === "spec" || delivery.stage === "review" ? "Open website spec" : "Open delivery"}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

const CELEBRATE_FOR_DAYS = 7;

/**
 * A short, happy note the first time this browser sees that a client approved
 * their website or that a site went live, within a week of it happening.
 * Shown once per website and step; motion is left out for those who ask for less.
 */
export function Celebration({ deliveries, names }: { deliveries: Map<string, Delivery> | null; names: Map<string, string> }) {
  const now = useNow();
  const [shown, setShown] = useState<{ key: string; text: string } | null>(null);
  useEffect(() => {
    if (!deliveries || !now || shown) return;
    for (const d of deliveries.values()) {
      if (d.stage !== "clientApproved" && d.stage !== "live") continue;
      if (!d.since || now - Date.parse(d.since) > CELEBRATE_FOR_DAYS * 86_400_000) continue;
      const key = `studio-os:celebrated:${d.projectId}:${d.stage}`;
      try {
        if (window.localStorage.getItem(key)) continue;
        window.localStorage.setItem(key, "1");
      } catch {
        continue;
      }
      const name = names.get(d.clientId) ?? "A client";
      // Shown once per arrival; the timer below puts it away.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown({ key, text: d.stage === "live" ? `${name}'s website is live!` : `${name} approved their website!` });
      return;
    }
  }, [deliveries, names, now, shown]);
  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), 6000);
    return () => window.clearTimeout(timer);
  }, [shown]);
  if (!shown) return null;
  return (
    <div role="status" className="celebration pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4">
      <div className="pointer-events-auto relative overflow-hidden rounded-full border border-positive/30 bg-surface px-5 py-2.5 text-[14px] font-medium text-ink shadow-[var(--shadow-overlay)]">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} aria-hidden className="confetti" style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 60}ms`, background: ["#879DC7", "#23794a", "#C8553D", "#E0B04A", "#6A3672"][i % 5] }} />
        ))}
        <span className="relative">{shown.text}</span>
      </div>
    </div>
  );
}
