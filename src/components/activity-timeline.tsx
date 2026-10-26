import Link from "next/link";
import { RelativeTime } from "@/components/ui/relative-time";
import type { ActivityEntry } from "@/lib/domain/insights";

/** Chronological list of events, newest first. */
export function ActivityTimeline({ entries, showClient = true }: { entries: ActivityEntry[]; showClient?: boolean }) {
  return (
    <ol className="relative">
      {entries.map(({ event, clientId, clientName }, index) => (
        <li key={event.id} className="relative flex gap-4 pb-5 last:pb-0">
          {index < entries.length - 1 ? (
            <span aria-hidden className="absolute top-3 bottom-0 left-[3.5px] w-px bg-line" />
          ) : null}
          <span aria-hidden className="relative mt-[7px] size-2 shrink-0 rounded-full border border-accent/60 bg-surface" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] leading-snug text-ink">{event.description}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-subtle">
              {showClient && clientId && clientName ? (
                <>
                  <Link href={`/clients/${clientId}`} className="text-ink-muted hover:text-ink hover:underline">
                    {clientName}
                  </Link>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              {event.actor ? (
                <>
                  <span>{event.actor}</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <RelativeTime iso={event.timestamp} />
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
