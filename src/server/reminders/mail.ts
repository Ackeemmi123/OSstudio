/**
 * The words of Studio OS's own e-mails to the team: the morning list of what
 * is due, and the note when a client comments, approves or answers on a
 * review link. Plain text, so every mail client shows it the same. Pure.
 */

export interface DigestEntry {
  userId: string;
  email: string;
  name: string;
  studio: string;
  steps: { title: string; client: string; clientId: string; dueOn: string; dueTime: string | null; assignee: string | null; mine: boolean }[];
  tasks: { title: string; project: string; client: string; clientId: string; dueOn: string }[];
}

export type ReviewEvent = { kind: "comment"; author: string; page: string; body: string } | { kind: "approval"; author: string } | { kind: "answers"; author: string };

export interface ReviewEventInfo {
  clientId: string;
  client: string;
  projectId: string;
  version: number;
  studio: string;
}

/** Today's date in Helsinki, YYYY-MM-DD, which is the day the studio works by. */
export function helsinkiDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Helsinki", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function addDays(day: string, days: number): string {
  const at = new Date(`${day}T12:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

function longDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}

const oneLine = (text: string, max = 160) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** The morning e-mail for one member. */
export function digestMail(entry: DigestEntry, day: string, origin: string): { subject: string; text: string } {
  const tomorrow = addDays(day, 1);
  type Item = { dueOn: string; line: string };
  const items: Item[] = [
    ...entry.steps.map((s) => ({
      dueOn: s.dueOn,
      line: `${s.dueTime ? `${s.dueTime} ` : ""}${oneLine(s.title)} · ${s.client}${s.mine ? " (you)" : s.assignee ? ` (${s.assignee})` : ""}\n  ${origin}/clients/${encodeURIComponent(s.clientId)}`,
    })),
    ...entry.tasks.map((t) => ({ dueOn: t.dueOn, line: `${oneLine(t.title)} · ${t.client}, ${t.project}\n  ${origin}/clients/${encodeURIComponent(t.clientId)}` })),
  ];
  const group = (title: string, list: Item[]) => (list.length ? [`${title}`, ...list.map((i) => `- ${i.line}`), ""] : []);
  const overdue = items.filter((i) => i.dueOn < day);
  const today = items.filter((i) => i.dueOn === day);
  const next = items.filter((i) => i.dueOn === tomorrow);
  const first = entry.name.trim().split(/\s+/)[0] || "there";
  const count = today.length + overdue.length;
  const subject = count ? `Today in Studio OS: ${count === 1 ? "1 thing" : `${count} things`} to do` : `Tomorrow in Studio OS: ${next.length === 1 ? "1 thing" : `${next.length} things`}`;
  const text = [
    `Good morning, ${first}.`,
    "",
    `Here is what is due at ${entry.studio}, ${longDay(day)}.`,
    "",
    ...group("Overdue", overdue),
    ...group("Today", today),
    ...group("Tomorrow", next),
    `Open Studio OS: ${origin}/`,
    "",
    "You get this because e-mail reminders are on for you. Turn them off under Settings › E-mail.",
  ].join("\n");
  return { subject, text };
}

/** The e-mail when a client acts on a review link. */
export function reviewEventMail(event: ReviewEvent, info: ReviewEventInfo, origin: string): { subject: string; text: string } {
  const link = `${origin}/clients/${encodeURIComponent(info.clientId)}/projects/${encodeURIComponent(info.projectId)}/site#delivery`;
  const who = oneLine(event.author, 80) || "The client";
  if (event.kind === "approval") {
    return {
      subject: `${info.client} approved their website`,
      text: [`${who} approved version ${info.version} of ${info.client}'s website on the review link.`, "", "Next: publish it on the client's domain.", link, "", footer()].join("\n"),
    };
  }
  if (event.kind === "answers") {
    return {
      subject: `${info.client} answered your questions`,
      text: [`${who} answered the questions on ${info.client}'s review link. The answers are in the client's sources.`, "", `${origin}/clients/${encodeURIComponent(info.clientId)}`, "", footer()].join("\n"),
    };
  }
  return {
    subject: `New comment from ${info.client}`,
    text: [`${who} commented on ${info.client}'s website (version ${info.version}), on the page ${event.page}:`, "", `"${oneLine(event.body, 500)}"`, "", "Answer it under Delivery:", link, "", footer()].join("\n"),
  };
}

function footer(): string {
  return "You get this because e-mails about clients are on for you. Turn them off under Settings › E-mail.";
}

/** The e-mail when a client answers questions or sends files on their portal. */
export function portalEventMail(event: { kind: "answers" | "files"; author: string; count: number }, info: { clientId: string; client: string }, origin: string): { subject: string; text: string } {
  const who = oneLine(event.author, 80) || "The client";
  const link = `${origin}/clients/${encodeURIComponent(info.clientId)}#sources`;
  if (event.kind === "files") {
    return {
      subject: `${info.client} sent ${event.count === 1 ? "a file" : `${event.count} files`}`,
      text: [`${who} sent ${event.count === 1 ? "a file" : `${event.count} files`} on ${info.client}'s portal, with their answers about rights and consent.`, "", "They are under Sources, ready to use:", link, "", footer()].join("\n"),
    };
  }
  return {
    subject: `${info.client} answered ${event.count === 1 ? "a question" : `${event.count} questions`}`,
    text: [`${who} answered ${event.count === 1 ? "a question" : `${event.count} questions`} on ${info.client}'s portal. The answers are under Sources.`, "", link, "", footer()].join("\n"),
  };
}
