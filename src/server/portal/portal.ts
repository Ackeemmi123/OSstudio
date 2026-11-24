/**
 * The client portal's requests: reading what the portal shows, the client's
 * answers to open questions, and files with the client's written answers
 * about rights and consent. No sign-in: the long random token is the key.
 * Pure apart from its dependencies, so it is tested without a database.
 */
import { z } from "zod";

export const PORTAL_TOKEN = /^[0-9a-f]{64}$/;

export interface PortalState {
  client: string;
  studio: string;
  studioEmail: string | null;
  color: string | null;
  locale: "sv" | "fi" | "en";
  spec: { version: number; status: string } | null;
  build: { link: string; approval: { name: string; at: string } | null; expiresAt: string } | null;
  live: { domain: string | null; url: string } | null;
  questions: { id: string; text: string }[];
  expiresAt: string;
}

export interface PortalDeps {
  state: (token: string) => Promise<PortalState | null>;
  answers: (token: string, answers: { author: string; answers: { id: string; answer: string }[] }) => Promise<{ error?: { code?: string } | null }>;
  /** Counts a file against the day's limit; says which client it belongs to. */
  claim: (token: string, bytes: number) => Promise<{ data?: { studioId: string; clientId: string } | null; error?: { code?: string } | null }>;
  /** Checks and stores one file as the client's material. */
  store: (target: { studioId: string; clientId: string }, bytes: Uint8Array, title: string, author: string) => Promise<{ ok: true } | { ok: false; reason: "type" | "size" | "failed" }>;
  note: (token: string, author: string, note: string) => Promise<{ error?: { code?: string } | null }>;
  notify?: (token: string, event: { kind: "answers" | "files"; author: string; count: number }) => void;
  now?: () => Date;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const closed = () => json(404, { error: "This link is not open. Ask the studio for a new one." });

export async function readPortal(token: string, deps: PortalDeps): Promise<Response> {
  if (!PORTAL_TOKEN.test(token)) return closed();
  const state = await deps.state(token);
  return state ? json(200, state) : closed();
}

const answersInput = z.object({
  author: z.string().trim().min(1).max(120),
  answers: z.array(z.object({ id: z.string().uuid(), answer: z.string().trim().max(3000) })).max(30),
  website: z.string().max(200).optional(),
});

export async function postPortalAnswers(token: string, body: unknown, deps: PortalDeps): Promise<Response> {
  if (!PORTAL_TOKEN.test(token)) return closed();
  const parsed = answersInput.safeParse(body);
  if (!parsed.success || !parsed.data.answers.some((a) => a.answer)) return json(400, { error: "Write your name and at least one answer." });
  if (parsed.data.website) return json(200, { ok: true });
  const answers = parsed.data.answers.filter((a) => a.answer);
  const { error } = await deps.answers(token, { author: parsed.data.author, answers });
  if (error?.code === "42501") return closed();
  if (error?.code === "22023") return json(400, { error: "The answers could not be read. Reload the page and try again." });
  if (error) return json(500, { error: "The answers were not saved. Try again." });
  deps.notify?.(token, { kind: "answers", author: parsed.data.author, count: answers.length });
  return json(201, { ok: true });
}

export const MAX_PORTAL_FILES = 10;
type Rights = "own" | "permission";
type People = "none" | "consent";
const RIGHTS_TEXT: Record<Rights, string> = { own: "vi äger bilden eller filen", permission: "vi har skriftligt tillstånd att använda den" };
const PEOPLE_TEXT: Record<People, string> = { none: "inga personer som kan kännas igen", consent: "personerna som syns har gett sitt samtycke till att visas på webbplatsen" };

/**
 * Files from the client: each with what it shows, who holds its rights, and
 * whether the people in it agreed. Every file needs those answers; the
 * answers are kept, in the client's words, as the written record.
 */
export async function postPortalFiles(token: string, form: FormData | null, deps: PortalDeps): Promise<Response> {
  if (!PORTAL_TOKEN.test(token)) return closed();
  if (!form) return json(400, { error: "Choose at least one file." });
  if (String(form.get("website") ?? "")) return json(200, { ok: true, stored: 0 });
  const author = String(form.get("author") ?? "").trim();
  if (!author || author.length > 120) return json(400, { error: "Write your name." });
  const files = form.getAll("file").filter((f): f is File => f instanceof Blob);
  if (!files.length) return json(400, { error: "Choose at least one file." });
  if (files.length > MAX_PORTAL_FILES) return json(400, { error: `Send at most ${MAX_PORTAL_FILES} files at a time.` });

  const stored: string[] = [];
  // Why a file was not taken, by code: the portal page says it in the client's language.
  const refused: { title: string; reason: "answers" | "limit" | "size" | "type" | "failed" }[] = [];
  for (const [i, file] of files.entries()) {
    const title = String(form.get(`title_${i}`) ?? "").trim().slice(0, 200) || file.name.slice(0, 200) || `Fil ${i + 1}`;
    const rights = String(form.get(`rights_${i}`) ?? "") as Rights;
    const people = String(form.get(`people_${i}`) ?? "") as People;
    if (!(rights in RIGHTS_TEXT) || !(people in PEOPLE_TEXT)) {
      refused.push({ title, reason: "answers" });
      continue;
    }
    const claim = await deps.claim(token, file.size);
    if (claim.error?.code === "42501") return closed();
    if (claim.error?.code === "54000") {
      refused.push({ title, reason: "limit" });
      break;
    }
    if (claim.error || !claim.data) {
      refused.push({ title, reason: claim.error?.code === "22023" ? "size" : "failed" });
      continue;
    }
    const result = await deps.store(claim.data, new Uint8Array(await file.arrayBuffer()), title, author);
    if (!result.ok) {
      refused.push({ title, reason: result.reason });
      continue;
    }
    stored.push(`- ${title}: ${RIGHTS_TEXT[rights]}; ${PEOPLE_TEXT[people]}.`);
  }
  if (stored.length) {
    const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    const note = [`${author} skickade ${stored.length === 1 ? "en fil" : `${stored.length} filer`} via kundportalen ${day} och svarade:`, "", ...stored].join("\n");
    await deps.note(token, author, note);
  }
  // The page sends one file per request (a request takes at most 4.5 MB); the last one says how many went, so the studio gets one e-mail.
  const sent = Number(form.get("sent") ?? 0);
  if (form.get("last") === "1" && (sent > 0 || stored.length)) deps.notify?.(token, { kind: "files", author, count: sent + stored.length });
  return json(stored.length ? 201 : 400, { ok: stored.length > 0, stored: stored.length, refused });
}
