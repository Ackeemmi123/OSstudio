/**
 * The client's review on a preview link: reading what the review bar shows,
 * and taking a comment or a written approval. No sign-in: the link's token
 * is the key, and the database refuses a link that is expired, turned off or
 * closed for review. Everything a client types is checked here first.
 */
import { z } from "zod";

export const APPROVAL_STATEMENT = "Jag godkänner webbplatsen som den ser ut i den här versionen. I approve the website as it looks in this version.";
const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;

const plain = (max: number) => z.string().trim().min(1).max(max).refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), "Contains control characters.");

export const commentInput = z.object({
  page: z.string().trim().min(1).max(200).regex(/^\/[^\s]*$/),
  target: z.string().trim().max(300).default(""),
  body: plain(2000),
  author: plain(120),
  /** A field people never see; a bot fills it. */
  website: z.string().max(0).optional(),
});

export const approvalInput = z.object({
  name: plain(120),
  role: z.string().trim().max(120).default(""),
  email: z.string().trim().max(200).regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  agree: z.literal(true),
  website: z.string().max(0).optional(),
});

export const answersInput = z.object({
  author: plain(120),
  answers: z.array(z.string().trim().max(3000)).min(1).max(8),
  website: z.string().max(0).optional(),
});

export interface ReviewState {
  buildId: string;
  studioId: string;
  /** The studio's questions for the client, until they are answered. Older links have none. */
  questions?: string[];
  answered?: boolean;
  comments: { page: string; target: string; body: string; author: string; status: "open" | "resolved"; reply: string | null; at: string }[];
  approval: { name: string; role: string; at: string } | null;
}

export interface ReviewDeps {
  state: (token: string) => Promise<ReviewState | null>;
  comment: (token: string, comment: { page: string; target: string; body: string; author: string }) => Promise<{ error?: { code?: string } | null }>;
  approve: (token: string, approval: { name: string; role: string; email: string; statement: string }) => Promise<{ error?: { code?: string } | null }>;
  answer: (token: string, answers: { author: string; answers: string[] }) => Promise<{ error?: { code?: string } | null }>;
}

const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
const closed = () => json(404, { error: "This link is not open for review." });

export async function readReview(token: string, deps: ReviewDeps): Promise<Response> {
  if (!TOKEN.test(token)) return closed();
  const state = await deps.state(token);
  if (!state) return closed();
  return json(200, { comments: state.comments, approval: state.approval, questions: state.questions ?? [], answered: state.answered ?? false });
}

export async function postComment(token: string, body: unknown, deps: ReviewDeps): Promise<Response> {
  if (!TOKEN.test(token)) return closed();
  const parsed = commentInput.safeParse(body);
  if (!parsed.success) return json(400, { error: "Write a comment and your name." });
  if (parsed.data.website) return json(200, { ok: true });
  const { page, target, body: text, author } = parsed.data;
  const { error } = await deps.comment(token, { page, target, body: text, author });
  if (error?.code === "42501") return closed();
  if (error?.code === "54000") return json(429, { error: "Too many comments in a short time. Try again later." });
  if (error) return json(500, { error: "The comment was not saved. Try again." });
  return json(201, { ok: true });
}

export async function postApproval(token: string, body: unknown, deps: ReviewDeps): Promise<Response> {
  if (!TOKEN.test(token)) return closed();
  const parsed = approvalInput.safeParse(body);
  if (!parsed.success) return json(400, { error: "Write your name and e-mail, and tick the approval." });
  if (parsed.data.website) return json(200, { ok: true });
  const { name, role, email } = parsed.data;
  const { error } = await deps.approve(token, { name, role, email, statement: APPROVAL_STATEMENT });
  if (error?.code === "42501") return closed();
  if (error?.code === "23505") return json(409, { error: "This version is already approved." });
  if (error) return json(500, { error: "The approval was not saved. Try again." });
  return json(201, { ok: true });
}

/** The client's answers to the studio's questions, all at once. They become the client's source material. */
export async function postAnswers(token: string, body: unknown, deps: ReviewDeps): Promise<Response> {
  if (!TOKEN.test(token)) return closed();
  const parsed = answersInput.safeParse(body);
  if (!parsed.success || !parsed.data.answers.some((answer) => answer)) return json(400, { error: "Answer at least one question, and write your name." });
  if (parsed.data.website) return json(200, { ok: true });
  const { author, answers } = parsed.data;
  const { error } = await deps.answer(token, { author, answers });
  if (error?.code === "42501") return closed();
  if (error?.code === "23505") return json(409, { error: "The questions are already answered." });
  if (error?.code === "22023") return json(400, { error: "The answers do not match the questions. Reload the page and try again." });
  if (error) return json(500, { error: "The answers were not saved. Try again." });
  return json(201, { ok: true });
}
