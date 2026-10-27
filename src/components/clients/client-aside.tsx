"use client";

import { ArrowUpRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ActivityTimeline } from "@/components/activity-timeline";
import { Section } from "@/components/ui/surface";
import { websiteHref } from "@/lib/domain/clients";
import { getClientActivity } from "@/lib/domain/insights";
import { SOURCE_TYPE_LABELS } from "@/lib/domain/labels";
import { CONTEXT_FIELD_KEYS, type Client, type StudioSnapshot } from "@/lib/domain/types";
import { formatDate } from "@/lib/format";

/** Source material and history: needed for context, rarely the first thing you look for. */
export function ClientAside({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  return (
    <div className="flex min-w-0 flex-col gap-10">
      <SourceMaterial client={client} />
      <History client={client} snapshot={snapshot} />
    </div>
  );
}

function SourceMaterial({ client }: { client: Client }) {
  const [expanded, setExpanded] = useState(false);
  const notes = client.source.initialNotes;
  const long = (notes?.length ?? 0) > 280;
  const referenced = Array.from(
    new Map(
      CONTEXT_FIELD_KEYS.flatMap((key) => {
        const source = client.context[key].source;
        return source?.label && source.type !== "manual" ? [[source.label, source] as const] : [];
      }),
    ).values(),
  );

  return (
    <Section id="sources" title="Source material">
      <div className="flex flex-col gap-4 text-[13.5px]">
        <div>
          <p className="text-ink">
            First contact · {SOURCE_TYPE_LABELS[client.source.type]}
            <span className="text-ink-subtle"> · {formatDate(client.source.receivedAt)}</span>
          </p>
          {notes ? (
            <>
              <p className={`mt-1.5 leading-relaxed whitespace-pre-wrap text-ink-muted ${long && !expanded ? "line-clamp-5" : ""}`}>{notes}</p>
              {long ? (
                <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 rounded-sm text-[12.5px] text-ink-subtle hover:text-ink">
                  {expanded ? "Show less" : "Show all"}
                </button>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-ink-subtle">No notes were recorded.</p>
          )}
        </div>
        {referenced.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[12.5px] text-ink-subtle">Cited in the brief</p>
            <ul className="flex flex-col gap-1">
              {referenced.map((source) => (
                <li key={source.label} className="text-ink-muted">
                  {source.url ? <ExternalLink href={source.url}>{source.label}</ExternalLink> : source.label}
                  <span className="text-ink-subtle"> · {SOURCE_TYPE_LABELS[source.type]}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-[12px] text-ink-subtle">Attaching files is not available yet.</p>
      </div>
    </Section>
  );
}

function History({ client, snapshot }: { client: Client; snapshot: StudioSnapshot }) {
  const [all, setAll] = useState(false);
  const events = getClientActivity(client.id, snapshot);
  const shown = all ? events : events.slice(0, 5);
  return (
    <Section id="activity" title="Activity" count={events.length || undefined}>
      {events.length === 0 ? (
        <p className="text-[13.5px] text-ink-subtle">No activity yet.</p>
      ) : (
        <>
          <ActivityTimeline entries={shown.map((event) => ({ event, clientId: client.id, clientName: client.name }))} showClient={false} />
          {events.length > 5 ? (
            <button type="button" onClick={() => setAll((v) => !v)} className="mt-3 rounded-sm text-[12.5px] text-ink-subtle hover:text-ink">
              {all ? "Show recent only" : `Show all ${events.length}`}
            </button>
          ) : null}
        </>
      )}
    </Section>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={websiteHref(href)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-ink-muted underline decoration-line-strong underline-offset-2 hover:text-ink hover:decoration-ink">
      {children}
      <ArrowUpRight aria-hidden className="size-3" />
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
