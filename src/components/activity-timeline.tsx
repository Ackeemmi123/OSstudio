import Link from "next/link";
import { RelativeTime } from "@/components/ui/relative-time";
import type { ActivityEntry } from "@/lib/domain/insights";
import { actorLabel } from "@/lib/domain/labels";

/** Compact list of events, newest first. */
export function ActivityTimeline({ entries, showClient = true }: { entries: ActivityEntry[]; showClient?: boolean }) {
  return (
    <ol className="flex flex-col gap-3.5">
      {entries.map(({ event, clientId, clientName }) => (
        <li key={event.id} className="min-w-0">
          <p className="text-[13.5px] leading-snug text-ink">{event.description}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-ink-subtle">
            {showClient && clientId && clientName ? (
              <>
                <Link href={`/clients/${encodeURIComponent(clientId)}`} className="text-ink-muted hover:text-ink hover:underline">
                  {clientName}
                </Link>
                <span aria-hidden>·</span>
              </>
            ) : null}
            {event.actor ? (
              <>
                <span>{actorLabel(event.actor)}</span>
                <span aria-hidden>·</span>
              </>
            ) : null}
            <RelativeTime iso={event.timestamp} />
          </p>
        </li>
      ))}
    </ol>
  );
}
