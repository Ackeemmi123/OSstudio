/**
 * Chase drafts: a message a person can send a client about a follow-up that
 * waits on the client. Built from fixed wording and the client's own records,
 * without AI. Nothing is stored and nothing is sent: the person edits the
 * text, copies it or opens it in their email app, and sends it themselves.
 */
import { getMissingEssentials } from "./clients";
import type { FollowUp, FollowUpKind } from "./followups";
import type { Client, StudioSnapshot } from "./types";

/**
 * Follow-ups that wait on the client: an unfinished brief, and a project that
 * has gone quiet. Approvals and reviews are left out: they are decisions for
 * the studio, which may not involve the client at all.
 */
export const CHASE_KINDS: ReadonlySet<FollowUpKind> = new Set(["onboarding", "quiet_project"]);

export interface ChaseDraft {
  /** The client's recorded email address, if any. */
  to: string | null;
  subject: string;
  body: string;
}

/** Brief essentials asked as plain questions. Contact details are not asked for: without them there is no one to write to. */
const ESSENTIAL_QUESTIONS: Partial<Record<string, string>> = {
  goal: "What would you most like the project to achieve?",
  budget: "Do you have a budget range in mind?",
  deadline: "Is there a date it needs to be ready by?",
};

/** At most this many questions in one message, so it stays easy to answer. */
const MAX_QUESTIONS = 5;

export function chaseDraft(followUp: FollowUp, snapshot: StudioSnapshot, sender: { name: string | null; studio: string | null }): ChaseDraft | null {
  if (!CHASE_KINDS.has(followUp.kind) || !followUp.clientId) return null;
  const client = snapshot.clients.find((c) => c.id === followUp.clientId);
  if (!client) return null;
  const greeting = `Hi ${firstName(client) ?? "there"},`;
  const signature = ["Best regards,", sender.name, sender.studio].filter(Boolean).join("\n");
  const message = (subject: string, ...paragraphs: string[]): ChaseDraft => ({
    to: client.email,
    subject,
    body: [greeting, ...paragraphs, signature].join("\n\n"),
  });

  if (followUp.kind === "onboarding") {
    const questions = openQuestions(client);
    if (questions.length === 0) {
      return message("Getting started", "I'm following up on your project. Is there anything you need from us before we continue? Once we have the details, we can plan the next steps.");
    }
    return message(
      "A few questions before we start",
      `To plan your project we need a few more details:\n\n${questions.map((q) => `- ${q}`).join("\n")}`,
      "A short answer to each is plenty. If anything is still undecided, just say so.",
    );
  }

  const project = snapshot.projects.find((p) => p.id === projectOf(followUp));
  if (!project) return null;
  return message(`Checking in on ${project.name}`, `I wanted to check in on ${project.name}. Is there anything you're waiting on from us, or anything that has changed on your side?`);
}

/** The questions to put to the client: open questions first, then missing essentials. */
function openQuestions(client: Client): string[] {
  const asked = client.contextItems.filter((item) => item.kind === "question" && item.confidence !== "superseded").map((item) => item.text.trim());
  const essentials = getMissingEssentials(client).flatMap((item) => ESSENTIAL_QUESTIONS[item.key] ?? []);
  const seen = new Set<string>();
  return [...asked, ...essentials]
    .filter((question) => {
      const key = question.toLocaleLowerCase();
      if (!question || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_QUESTIONS);
}

function firstName(client: Client): string | null {
  return client.contactPerson?.trim().split(/\s+/)[0] || null;
}

/** The project a quiet-project follow-up is about, from its id ("follow-project-…"). */
function projectOf(followUp: FollowUp): string | null {
  return /^follow-project-(.+)$/.exec(followUp.id)?.[1] ?? null;
}

/** A mailto: link that opens the draft in the person's email app. */
export function mailtoLink(draft: ChaseDraft): string | null {
  if (!draft.to) return null;
  return `mailto:${encodeURIComponent(draft.to)}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}
