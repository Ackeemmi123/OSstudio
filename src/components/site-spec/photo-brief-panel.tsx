"use client";

import { Camera } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusLabel } from "@/components/ui/status";
import { photoBriefText, photoNeedLabel, photoNeeds, photosInHand } from "@/lib/site-spec/photo-brief";
import type { SiteSpec } from "@/lib/site-spec/schema";

/**
 * Which photos this site needs, from its concept and sections, and a text
 * in the site's language to send to the client as it is.
 */
export function PhotoBriefPanel({ spec }: { spec: SiteSpec }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const needs = photoNeeds(spec);
  if (!needs.length) return null;
  const text = photoBriefText(spec);
  const inHand = photosInHand(spec);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setOpen(true);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-line px-4 py-4" aria-labelledby="photo-brief-heading" data-testid="photo-brief">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="photo-brief-heading" className="text-[14px] font-medium text-ink">
          Photo brief
        </h3>
        <div className="flex gap-2">
          <Button size="xs" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide the text" : "Show the text"}
          </Button>
          <Button size="xs" variant="primary" onClick={copy}>
            <Camera aria-hidden />
            {copied ? "Copied" : "Copy for the client"}
          </Button>
        </div>
      </div>
      <p className="text-[12.5px] text-ink-muted">The client&apos;s own photos make the site theirs. This follows from the concept; the text is in the site&apos;s language, ready to send.</p>
      <ul className="flex flex-col gap-1 text-[13px]">
        {needs.map((need) => (
          <li key={need.slot} className="flex flex-wrap items-baseline gap-2">
            <span className="text-ink">{photoNeedLabel(need, spec)}</span>
            {need.required ? <StatusLabel tone="caution">Needed</StatusLabel> : <span className="text-[12px] text-ink-subtle">Nice to have</span>}
          </li>
        ))}
      </ul>
      <p className="text-[12.5px] text-ink-muted">
        {inHand === 0 ? "No photos with files in the spec yet." : `${inHand} ${inHand === 1 ? "photo" : "photos"} with files in the spec.`}
      </p>
      {open ? <pre className="max-h-80 overflow-auto rounded-[var(--radius-control)] bg-surface-muted/60 p-3 text-[12.5px] whitespace-pre-wrap text-ink">{text}</pre> : null}
    </section>
  );
}
