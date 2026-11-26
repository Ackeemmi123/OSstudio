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

/** The languages a message to a client can be in: the ones Axivo's clients speak. */
export type ChaseLanguage = "fi" | "sv" | "en";

/** Every fixed word of a message, per language. */
const WORDS: Record<ChaseLanguage, {
  hello: (name: string | null) => string;
  regards: string;
  startSubject: string;
  start: string;
  askSubject: string;
  askIntro: string;
  askOutro: string;
  checkSubject: (project: string) => string;
  check: (project: string) => string;
  /** Brief essentials asked as plain questions. Contact details are not asked for: without them there is no one to write to. */
  essentials: Partial<Record<string, string>>;
}> = {
  en: {
    hello: (name) => `Hi ${name ?? "there"},`,
    regards: "Best regards,",
    startSubject: "Getting started",
    start: "I'm following up on your project. Is there anything you need from us before we continue? Once we have the details, we can plan the next steps.",
    askSubject: "A few questions before we start",
    askIntro: "To plan your project we need a few more details:",
    askOutro: "A short answer to each is plenty. If anything is still undecided, just say so.",
    checkSubject: (project) => `Checking in on ${project}`,
    check: (project) => `I wanted to check in on ${project}. Is there anything you're waiting on from us, or anything that has changed on your side?`,
    essentials: { goal: "What would you most like the project to achieve?", budget: "Do you have a budget range in mind?", deadline: "Is there a date it needs to be ready by?" },
  },
  fi: {
    hello: (name) => (name ? `Hei ${name},` : "Hei,"),
    regards: "Terveisin",
    startSubject: "Projektin aloitus",
    start: "Palaan projektiinne. Tarvitsetteko meiltä jotain ennen kuin jatkamme? Kun saamme tiedot, voimme suunnitella seuraavat vaiheet.",
    askSubject: "Muutama kysymys ennen aloitusta",
    askIntro: "Tarvitsemme vielä muutaman tiedon projektin suunnitteluun:",
    askOutro: "Lyhyt vastaus jokaiseen riittää. Jos jokin on vielä auki, kertokaa vain se.",
    checkSubject: (project) => `Tilannekatsaus: ${project}`,
    check: (project) => `Halusin kysyä, miten ${project} etenee. Odotatteko meiltä jotain, tai onko teillä jokin muuttunut?`,
    essentials: { goal: "Mitä projektin pitäisi ennen kaikkea saavuttaa?", budget: "Onko teillä mielessä budjetti?", deadline: "Onko päivämäärää, johon mennessä sen pitää olla valmis?" },
  },
  sv: {
    hello: (name) => (name ? `Hej ${name}!` : "Hej!"),
    regards: "Hälsningar",
    startSubject: "Vi kommer igång",
    start: "Jag hör av mig om ert projekt. Behöver ni något från oss innan vi fortsätter? När vi har uppgifterna kan vi planera nästa steg.",
    askSubject: "Några frågor innan vi börjar",
    askIntro: "För att planera projektet behöver vi några uppgifter till:",
    askOutro: "Ett kort svar på varje räcker. Om något är oklart ännu, säg bara det.",
    checkSubject: (project) => `Hur går det med ${project}?`,
    check: (project) => `Jag ville höra hur det går med ${project}. Väntar ni på något från oss, eller har något ändrats hos er?`,
    essentials: { goal: "Vad vill ni främst uppnå med projektet?", budget: "Har ni en budget i tankarna?", deadline: "Finns det ett datum då det ska vara klart?" },
  },
};

/** The language to write to a client in: the one their website inquiry came in, else Finnish. */
export function clientLanguage(clientId: string, snapshot: Pick<StudioSnapshot, "inquiries">): ChaseLanguage {
  const inquiry = snapshot.inquiries.filter((i) => i.clientId === clientId).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
  return inquiry?.locale ?? "fi";
}

/** At most this many questions in one message, so it stays easy to answer. */
const MAX_QUESTIONS = 5;

export function chaseDraft(followUp: FollowUp, snapshot: StudioSnapshot, sender: { name: string | null; studio: string | null }, language: ChaseLanguage = "en"): ChaseDraft | null {
  if (!CHASE_KINDS.has(followUp.kind) || !followUp.clientId) return null;
  const client = snapshot.clients.find((c) => c.id === followUp.clientId);
  if (!client) return null;
  const w = WORDS[language];
  const greeting = w.hello(firstName(client));
  const signature = [w.regards, sender.name, sender.studio].filter(Boolean).join("\n");
  const message = (subject: string, ...paragraphs: string[]): ChaseDraft => ({
    to: client.email,
    subject,
    body: [greeting, ...paragraphs, signature].join("\n\n"),
  });

  if (followUp.kind === "onboarding") {
    const questions = openQuestions(client, w.essentials);
    if (questions.length === 0) return message(w.startSubject, w.start);
    return message(w.askSubject, `${w.askIntro}\n\n${questions.map((q) => `- ${q}`).join("\n")}`, w.askOutro);
  }

  const project = snapshot.projects.find((p) => p.id === projectOf(followUp));
  if (!project) return null;
  return message(w.checkSubject(project.name), w.check(project.name));
}

/** The questions to put to the client: open questions first, then missing essentials. */
function openQuestions(client: Client, essentialQuestions: Partial<Record<string, string>>): string[] {
  const asked = client.contextItems.filter((item) => item.kind === "question" && item.confidence !== "superseded").map((item) => item.text.trim());
  const essentials = getMissingEssentials(client).flatMap((item) => essentialQuestions[item.key] ?? []);
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
