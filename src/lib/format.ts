const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "3 hours ago", "Yesterday", "12 days ago", then a calendar date. */
export function formatRelative(iso: string, nowMs: number): string {
  const diff = nowMs - new Date(iso).getTime();
  if (diff < MINUTE) return "Just now";
  if (diff < HOUR) return plural(Math.floor(diff / MINUTE), "minute");
  if (diff < DAY) return plural(Math.floor(diff / HOUR), "hour");
  if (diff < 2 * DAY) return "Yesterday";
  if (diff < 30 * DAY) return plural(Math.floor(diff / DAY), "day");
  return formatDate(iso);
}

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    // Date-only values have no time zone; render them exactly as written.
    timeZone: DATE_ONLY.test(iso) ? "UTC" : undefined,
  });
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Formats ISO dates (YYYY-MM-DD) as readable dates and leaves free text, like "Spring 2027", untouched. */
export function formatContextValue(value: string): string {
  return DATE_ONLY.test(value) ? formatDate(value) : value;
}
