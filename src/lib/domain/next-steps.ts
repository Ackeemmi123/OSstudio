/**
 * Next steps and the calendar. A next step is due on a day in Helsinki, at a
 * time if it has one. Today groups them; the calendar feed and the "add to
 * calendar" file are written here as iCalendar (RFC 5545), so any calendar app
 * shows them with a reminder. Nothing here reads or writes the database.
 */
import { helsinkiDate } from "./followups";
import type { NextStep } from "./types";

const TIME_ZONE = "Europe/Helsinki";

export interface NextStepGroups {
  overdue: NextStep[];
  today: NextStep[];
  upcoming: NextStep[];
}

const byDue = (a: NextStep, b: NextStep) => a.dueOn.localeCompare(b.dueOn) || (a.dueTime ?? "").localeCompare(b.dueTime ?? "");

/** Open next steps by when they are due, in Helsinki. Done ones are left out. */
export function groupNextSteps(steps: readonly NextStep[], nowMs: number): NextStepGroups {
  const today = helsinkiDate(nowMs);
  const open = steps.filter((step) => step.status === "open").slice().sort(byDue);
  return {
    overdue: open.filter((step) => step.dueOn < today),
    today: open.filter((step) => step.dueOn === today),
    upcoming: open.filter((step) => step.dueOn > today),
  };
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "Tue 25 Nov, 10:00", or "Today, 10:00" and "Tomorrow" near now. */
export function describeDue(step: Pick<NextStep, "dueOn" | "dueTime">, nowMs: number): string {
  const today = helsinkiDate(nowMs);
  const tomorrow = helsinkiDate(nowMs + 24 * 60 * 60 * 1000);
  const day = step.dueOn === today ? "Today" : step.dueOn === tomorrow ? "Tomorrow" : DAY_FORMAT.format(Date.parse(`${step.dueOn}T12:00:00Z`));
  return step.dueTime ? `${day}, ${step.dueTime}` : day;
}

/** The UTC moment of a wall-clock time in Helsinki, summer time included. */
export function helsinkiToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        .formatToParts(guess)
        .map((part) => [part.type, part.value]),
    );
    const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += wanted - shown;
  }
  return new Date(guess);
}

/* -------------------------------------------------------------------------- */
/* iCalendar                                                                  */
/* -------------------------------------------------------------------------- */

export interface CalendarEvent {
  uid: string;
  title: string;
  description?: string;
  url?: string;
  dueOn: string;
  dueTime: string | null;
  /** When the item last changed, for DTSTAMP. */
  stamp: string;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded, as the standard asks. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = new TextEncoder().encode(char).length;
    if (size + width > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += width;
  }
  out.push(current);
  return out.join("\r\n ");
}

const stampOf = (iso: string) => {
  const ms = Date.parse(iso);
  return new Date(Number.isNaN(ms) ? 0 : ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
};
const compactDate = (date: string) => date.replace(/-/g, "");
const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

function eventLines(event: CalendarEvent): string[] {
  const lines = ["BEGIN:VEVENT", `UID:${event.uid}`, `DTSTAMP:${stampOf(event.stamp)}`];
  if (event.dueTime) {
    lines.push(`DTSTART:${stampOf(helsinkiToUtc(event.dueOn, event.dueTime).toISOString())}`, "DURATION:PT30M");
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(event.dueOn)}`, `DTEND;VALUE=DATE:${compactDate(nextDay(event.dueOn))}`);
  }
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  // A reminder: 15 minutes before a timed step, 9:00 on the day for one without a time.
  lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeText(event.title)}`, event.dueTime ? "TRIGGER:-PT15M" : "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
  return lines;
}

/** A whole calendar, for the feed or a single downloaded event. */
export function calendar(name: string, events: readonly CalendarEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Axivo//Studio OS//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`,
    `X-WR-TIMEZONE:${TIME_ZONE}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap(eventLines),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** One next step as a calendar event, with a link back to the client in Studio OS. */
export function nextStepEvent(step: Pick<NextStep, "id" | "title" | "dueOn" | "dueTime" | "createdAt" | "clientId">, clientName: string, origin: string): CalendarEvent {
  return {
    uid: `next-step-${step.id}@studio-os`,
    title: `${step.title} · ${clientName}`,
    description: "Next step in Studio OS",
    url: `${origin}/clients/${encodeURIComponent(step.clientId)}`,
    dueOn: step.dueOn,
    dueTime: step.dueTime,
    stamp: step.createdAt,
  };
}
