"use client";

import { formatDateTime, formatRelative } from "@/lib/format";
import { useNow } from "@/lib/use-now";

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  const now = useNow();
  return (
    <time dateTime={iso} title={now ? formatDateTime(iso) : undefined} className={className}>
      {now ? formatRelative(iso, now) : " "}
    </time>
  );
}
