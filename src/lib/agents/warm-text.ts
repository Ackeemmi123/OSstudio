/**
 * The warmer-text pass (Website Factory step 3c). Once a website spec has its
 * texts, the Design agent reads them beside the client's own writing and
 * proposes rewordings that sound more like the client: their own words,
 * shorter sentences, less agency language. It never changes a fact: a
 * proposal that adds a name, number, place, date, address or link the text
 * did not have is dropped here, before anyone sees it. Each proposal is shown
 * beside the text it would replace, and a person ticks the ones to take.
 *
 * Only prose is offered: headings, short lines and body texts of the main
 * pages. Names, roles, prices, quotes from customers, contact details, legal
 * and footer pages, form texts and image descriptions are never sent.
 */
import { z } from "zod";
import { stockPhrase } from "@/lib/site-spec/industries";
import type { SiteSpec, SiteSpecPage } from "@/lib/site-spec/schema";
import { isPlaceholderText, visibleTexts } from "@/lib/site-spec/texts";
import type { IntakeSource } from "./intake";

/** Section kinds whose texts may be reworded. People, quotes, contact and media sections are left alone. */
const WARM_KINDS = new Set(["hero", "text", "text_media", "features", "services", "faq", "cta"]);
/** Fields that hold prose. Eyebrows, item titles of services, prices and names are facts or labels. */
const SECTION_KEYS = new Set(["heading", "subheading", "body"]);
const ITEM_KEYS: Record<string, Set<string>> = { features: new Set(["title", "body"]), services: new Set(["body"]), faq: new Set(["answer"]) };
/** Pages whose texts are formal or legal, by slug, besides every footer page. */
const FORMAL_SLUGS = /^(integritet|privacy|tietosuoja|dataskydd|stadgar|regler|saannot|säännöt|villkor|terms|ehdot)/;

export const WARM_TEXT_LIMITS = {
  /** Texts sent per pass. */
  texts: 80,
  /** Characters of the client's own writing sent as the voice to follow. */
  voiceCharacters: 24_000,
  /** Proposals kept per pass. */
  suggestions: 30,
} as const;

export interface WarmTextCandidate {
  path: string;
  /** "Home › Hero: the heading". */
  name: string;
  text: string;
}

export interface WarmTextInput {
  client: { name: string };
  /** The spec's industry and tone, which say how the site should sound. */
  industry: string | null;
  tone: string;
  language: string;
  texts: WarmTextCandidate[];
  /** The client's own writing: emails, answers on the review link, notes. Quoted for its voice only. */
  voice: Pick<IntakeSource, "id" | "label" | "content">[];
}

function isFormalPage(page: SiteSpecPage): boolean {
  if (page.nav === "footer") return true;
  return Object.values(page.slug).some((slug) => slug && FORMAL_SLUGS.test(slug));
}

/** The texts of a spec that the pass may propose to reword, in reading order. */
export function warmTextCandidates(spec: SiteSpec): WarmTextCandidate[] {
  const out: WarmTextCandidate[] = [];
  for (const text of visibleTexts(spec)) {
    const match = /^pages\.(\d+)\.sections\.(\d+)\.(.+)\.(en|sv|fi)$/.exec(text.path);
    if (!match || text.locale !== spec.locales.default) continue;
    const page = spec.pages[Number(match[1])];
    const section = page?.sections[Number(match[2])];
    if (!page || !section || isFormalPage(page) || !WARM_KINDS.has(section.kind)) continue;
    const field = match[3];
    const item = /^items\.\d+\.(\w+)$/.exec(field);
    const allowed = item ? Boolean(ITEM_KEYS[section.kind]?.has(item[1])) : SECTION_KEYS.has(field);
    if (!allowed) continue;
    // A hero heading's last words are set apart by `emphasis`, which must stay its ending.
    if (section.kind === "hero" && field === "heading" && Object.values((section as { emphasis?: Record<string, string> }).emphasis ?? {}).some(Boolean)) continue;
    if (isPlaceholderText(text.text) || text.text.includes("[")) continue;
    out.push({ path: text.path, name: text.name, text: text.text });
    if (out.length >= WARM_TEXT_LIMITS.texts) break;
  }
  return out;
}

/** The client's own writing, newest last, cut to the limit. */
export function voiceOf(sources: Pick<IntakeSource, "id" | "label" | "content">[]): WarmTextInput["voice"] {
  const out: WarmTextInput["voice"] = [];
  let left: number = WARM_TEXT_LIMITS.voiceCharacters;
  for (const source of sources) {
    const content = source.content.trim();
    if (!content || left <= 0) continue;
    out.push({ id: source.id, label: source.label, content: content.slice(0, left) });
    left -= Math.min(content.length, left);
  }
  return out;
}

export function checkWarmTextInput(input: WarmTextInput): { ok: true } | { ok: false; blocker: string } {
  if (input.texts.length < 3) {
    return { ok: false, blocker: "There is too little text on the main pages to improve. Draft or write the website's texts first." };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* What the model answers, and what is kept                                   */
/* -------------------------------------------------------------------------- */

export const warmTextModelOutput = z.object({
  /** One or two sentences, in the site's language, on what the pass changed overall. */
  summary: z.string(),
  suggestions: z.array(
    z.object({
      /** The path of a text in the request, exactly as given. */
      path: z.string(),
      /** The whole new text. */
      text: z.string(),
      /** One short sentence, in the site's language: what is warmer about it. */
      reason: z.string(),
    }),
  ),
});
export type WarmTextModelOutput = z.infer<typeof warmTextModelOutput>;

export interface WarmTextSuggestion {
  path: string;
  name: string;
  before: string;
  after: string;
  reason: string;
}

export interface WarmTextResult {
  kind: "warm_text";
  /** The spec version the texts were read from. */
  specId: string;
  specVersion: number;
  summary: string;
  suggestions: WarmTextSuggestion[];
  /** Proposals left out by the checks, and why, so a person can see the pass was careful. */
  dropped: { path: string; name: string; reason: string }[];
  externalResearch: false;
}

const URL_OR_EMAIL = /\b(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w-]+\.[\w.-]+/gi;
const NUMBER = /\d+(?:[.,:\-–]\d+)*/g;
const CAPITALISED = /\p{Lu}[\p{L}'’-]*/gu;

const lower = (text: string) => text.toLocaleLowerCase("sv");

/** Capitalised words that do not start a sentence: in Swedish and Finnish, nearly always names. */
function namesIn(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(CAPITALISED)) {
    const at = match.index ?? 0;
    if (match[0] === "I" || (at > 0 && /[\p{L}\d]/u.test(text[at - 1]))) continue;
    const before = text.slice(0, at).replace(/[\s"“”'‘’(«»–-]+$/u, "");
    if (before === "" || /[.!?:…]$/.test(before)) continue;
    out.push(match[0]);
  }
  return out;
}

/**
 * Facts the new text has that the old one did not: numbers, links, email
 * addresses and names. The pass may reorder and shorten, never add these.
 */
export function addedFacts(before: string, after: string): string[] {
  const had = lower(before);
  const added = new Set<string>();
  for (const pattern of [URL_OR_EMAIL, NUMBER]) {
    for (const match of after.match(pattern) ?? []) {
      // A sentence's full stop is not part of the link.
      const found = match.replace(/[.,;:!?)]+$/, "");
      if (found && !had.includes(lower(found))) added.add(found);
    }
  }
  for (const found of namesIn(after)) {
    if (!had.includes(lower(found))) added.add(found);
  }
  return [...added];
}

/** Proposals that pass the checks, with the old text beside each, and those dropped with the reason. */
export function normalizeWarmText(output: unknown, input: WarmTextInput, spec: { id: string; version: number }): WarmTextResult {
  const parsed = warmTextModelOutput.parse(output);
  const byPath = new Map(input.texts.map((t) => [t.path, t]));
  const suggestions: WarmTextSuggestion[] = [];
  const dropped: WarmTextResult["dropped"] = [];
  const seen = new Set<string>();
  for (const proposal of parsed.suggestions) {
    const original = byPath.get(proposal.path);
    if (!original || seen.has(proposal.path)) continue;
    const after = proposal.text.replace(/[ \t]+\n/g, "\n").trim();
    const drop = (reason: string) => dropped.push({ path: original.path, name: original.name, reason });
    if (!after || after === original.text.trim()) continue;
    seen.add(proposal.path);
    const facts = addedFacts(original.text, after);
    if (facts.length) {
      drop(`It added ${facts.map((f) => `"${f}"`).join(", ")}, which the text did not say.`);
      continue;
    }
    const stock = stockPhrase(after);
    if (stock && !stockPhrase(original.text)) {
      drop(`It used stock web copy ("${stock}").`);
      continue;
    }
    if (after.includes("[")) {
      drop("It left an instruction in brackets.");
      continue;
    }
    if (after.length > Math.max(original.text.length * 1.5, original.text.length + 80)) {
      drop("It made the text much longer.");
      continue;
    }
    if (suggestions.length >= WARM_TEXT_LIMITS.suggestions) {
      drop(`Only ${WARM_TEXT_LIMITS.suggestions} proposals are kept per pass.`);
      continue;
    }
    suggestions.push({ path: original.path, name: original.name, before: original.text, after, reason: proposal.reason.trim().slice(0, 300) });
  }
  return { kind: "warm_text", specId: spec.id, specVersion: spec.version, summary: parsed.summary.trim().slice(0, 600), suggestions, dropped, externalResearch: false };
}

/* -------------------------------------------------------------------------- */
/* Taking the chosen proposals                                                */
/* -------------------------------------------------------------------------- */

function readAt(root: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((at, key) => (at && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined), root);
}

/**
 * Writes the chosen proposals into the spec, in place. A text that changed
 * since the pass read it is left as it is: the person's newer words win.
 * Returns how many were taken and how many were skipped for that reason.
 */
export function applyWarmText(spec: SiteSpec, chosen: readonly WarmTextSuggestion[]): { taken: number; changedSince: number } {
  let taken = 0;
  let changedSince = 0;
  for (const suggestion of chosen) {
    const keys = suggestion.path.split(".");
    const last = keys.pop()!;
    const parent = readAt(spec, keys.join("."));
    const current = parent && typeof parent === "object" ? (parent as Record<string, unknown>)[last] : undefined;
    if (typeof current !== "string" || current.trim() !== suggestion.before.trim()) {
      changedSince++;
      continue;
    }
    (parent as Record<string, unknown>)[last] = suggestion.after;
    taken++;
  }
  return { taken, changedSince };
}

/* -------------------------------------------------------------------------- */
/* Run bookkeeping                                                             */
/* -------------------------------------------------------------------------- */

export async function warmTextFingerprint(input: WarmTextInput, promptVersion: string): Promise<string> {
  const material = JSON.stringify({ promptVersion, input });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export function warmTextIdempotencyKey(specId: string, fingerprint: string) {
  return `design.warm_text:${specId}:${fingerprint}`;
}
