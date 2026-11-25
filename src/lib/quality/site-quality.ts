/**
 * The quality gate: how a built site measures up before a client sees it.
 * It reads the finished pages as a visitor and a search engine would, without
 * a browser: what a visitor needs at once, whether the words sound like a
 * person rather than a template or an AI, accessibility and search basics,
 * and how heavy the pages are. It cannot judge beauty or the layout on a
 * phone; a person still does that. Pure.
 */
import { analyzePage, visibleText } from "@/lib/benchmark/analyze";
import { STOCK_PHRASES, type Industry } from "@/lib/site-spec/industries";

export interface BuiltPage {
  path: string;
  html: string;
}

export interface QualityItem {
  ok: boolean;
  text: string;
  /** Which page, when it is about one. */
  where?: string;
  /** How much it counts: 3 for what a visitor misses at once, 1 for polish. */
  weight: number;
}

export interface QualityGroup {
  key: "visitor" | "words" | "access" | "search" | "weight";
  label: string;
  items: QualityItem[];
}

export interface QualityReport {
  level: "quality";
  score: number;
  verdict: "ready" | "fix_first" | "not_ready";
  groups: QualityGroup[];
}

/** From this score a site is ready to send; under the lower one it is not. */
export const READY_FROM = 85;
export const NOT_READY_UNDER = 70;

/** Words that make a text read as written by an AI, beyond the stock phrases. */
const AI_TELLS = [
  "delve", "tapestry", "embark on", "in the realm of", "a testament to", "navigate the", "unleash", "game-changer", "game changer", "synergy", "holistic approach",
  "i en värld där", "låt oss ta", "på riktigt", "en resa", "upptäck magin", "vi tar hand om allt",
  "maailmassa, jossa", "matka kohti", "taikaa",
];

/** Trades where a visitor expects opening hours. */
const HOURS_EXPECTED: readonly Industry[] = ["cafe_restaurant", "retail", "health_beauty"];
/** Trades where a visitor comes to a place, so the address belongs on the home page. */
const ADDRESS_EXPECTED: readonly Industry[] = ["cafe_restaurant", "retail", "health_beauty", "interior_design", "trades"];

const GENERIC_HEADINGS = /^(welcome|välkommen|tervetuloa|home|hem|etusivu|about us|om oss|meistä)\b/i;
const VAGUE_LINKS = /^(click here|read more|here|klicka här|läs mer|här|lue lisää|tästä|klikkaa tästä)$/i;
const PAGE_BUDGET = 150_000;
const IMAGE_BUDGET = 400_000;

const pageName = (path: string) => (path === "index.html" ? "Home" : path.replace(/\/?index\.html$/, "").replace(/\.html$/, "") || "Home");

export function siteQuality(input: { pages: BuiltPage[]; images?: { path: string; bytes: number }[]; industry?: Industry; origin?: string }): QualityReport {
  const pages = input.pages.filter((p) => p.path.endsWith(".html") && !/(^|\/)404\.html$/.test(p.path));
  const home = pages.find((p) => p.path === "index.html") ?? pages[0];
  const facts = home ? analyzePage(home.html, `${input.origin ?? "https://example.fi"}/`) : null;
  const industry = input.industry;

  const visitor: QualityItem[] = facts
    ? [
        { ok: facts.phone || facts.email, text: "A phone number or e-mail on the home page", weight: 3 },
        { ok: facts.form || facts.email, text: "A way to get in touch: a form or an e-mail link", weight: 3 },
        { ok: Boolean(facts.heading) && !GENERIC_HEADINGS.test(facts.heading), text: facts.heading ? `A main heading that says something ("${facts.heading.slice(0, 60)}")` : "A main heading on the home page", weight: 3 },
        ...(industry && ADDRESS_EXPECTED.includes(industry) ? [{ ok: facts.address, text: "The address, for a business people visit", weight: 2 }] : []),
        ...(industry && HOURS_EXPECTED.includes(industry) ? [{ ok: facts.hours, text: "Opening hours", weight: 2 }] : []),
      ]
    : [{ ok: false, text: "The site has a home page", weight: 3 }];

  const texts = pages.map((p) => ({ page: pageName(p.path), text: visibleText(p.html) }));
  const all = texts.map((t) => t.text).join(" \n ").toLocaleLowerCase("sv");
  const stock = STOCK_PHRASES.filter(({ pattern }) => pattern.test(all)).map(({ phrase }) => phrase);
  const tells = AI_TELLS.filter((tell) => all.includes(tell));
  const exclamations = (all.match(/!/g) ?? []).length;
  const sentences = new Map<string, Set<string>>();
  // Sentences inside paragraphs and list items, so a heading never runs into the next sentence.
  for (const p of pages) {
    const page = pageName(p.path);
    // The header, menu and footer repeat on every page by design, and so does a contact form with its standard consent line.
    const main = p.html.replace(/<(header|nav|footer|form)\b[\s\S]*?<\/\1>/gi, " ");
    const blocks = [...main.matchAll(/<(p|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => visibleText(m[2]));
    for (const sentence of blocks.flatMap((block) => block.split(/(?<=[.!?])\s+/))) {
      const s = sentence.trim();
      if (s.split(/\s+/).length < 8) continue;
      sentences.set(s, (sentences.get(s) ?? new Set()).add(page));
    }
  }
  const repeated = [...sentences.entries()].filter(([, where]) => where.size > 1).map(([s]) => s);
  const leftovers = texts.filter((t) => /\(test\)|\[[^\]\n]*\p{L}{2}[^\]\n]*\]|lorem ipsum/iu.test(t.text)).map((t) => t.page);
  const words: QualityItem[] = [
    { ok: leftovers.length === 0, text: leftovers.length ? `Draft text or "(test)" left on ${leftovers.join(", ")}` : 'No draft text or "(test)" left', weight: 3 },
    { ok: stock.length === 0, text: stock.length ? `Stock web phrases: ${stock.slice(0, 4).join(", ")}` : "No stock web phrases", weight: 2 },
    { ok: tells.length === 0, text: tells.length ? `Words that sound AI-written: ${tells.slice(0, 4).join(", ")}` : "No words that sound AI-written", weight: 2 },
    { ok: exclamations <= Math.max(2, pages.length), text: exclamations > Math.max(2, pages.length) ? `${exclamations} exclamation marks: a calm site sells better` : "Calm punctuation", weight: 1 },
    { ok: repeated.length === 0, text: repeated.length ? `The same sentence on several pages: "${repeated[0].slice(0, 70)}…"` : "No sentence repeated across pages", weight: 1 },
  ];

  const access: QualityItem[] = [];
  const search: QualityItem[] = [];
  const titles = new Map<string, string[]>();
  const descriptions = new Map<string, string[]>();
  for (const page of pages) {
    const name = pageName(page.path);
    const h1s = (page.html.match(/<h1\b/gi) ?? []).length;
    if (h1s !== 1) access.push({ ok: false, text: `${h1s === 0 ? "No" : h1s} main headings (h1) instead of one`, where: name, weight: 2 });
    const levels = [...page.html.matchAll(/<h([1-6])\b/gi)].map((m) => Number(m[1]));
    const skip = levels.findIndex((level, i) => i > 0 && level > levels[i - 1] + 1);
    if (skip > 0) access.push({ ok: false, text: `A heading level is skipped (h${levels[skip - 1]} to h${levels[skip]})`, where: name, weight: 1 });
    if (!/<html\b[^>]*\blang=/i.test(page.html)) access.push({ ok: false, text: "The page does not say its language", where: name, weight: 2 });
    const vague = [...page.html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => visibleText(m[1])).filter((t) => VAGUE_LINKS.test(t));
    if (vague.length) access.push({ ok: false, text: `Links that say only "${vague[0]}"`, where: name, weight: 1 });
    const imgs = page.html.match(/<img\b[^>]*>/gi) ?? [];
    if (imgs.some((tag) => !/\salt=/i.test(tag))) access.push({ ok: false, text: "An image without alternative text", where: name, weight: 2 });

    const title = (/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(page.html)?.[1] ?? "").trim();
    const description = (/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(page.html)?.[1] ?? "").trim();
    if (!title) search.push({ ok: false, text: "No page title", where: name, weight: 2 });
    else if (title.length > 65) search.push({ ok: false, text: `The title is ${title.length} characters; search results cut it at about 60`, where: name, weight: 1 });
    if (!description) search.push({ ok: false, text: "No search description", where: name, weight: 2 });
    else if (description.length > 165) search.push({ ok: false, text: `The search description is ${description.length} characters; about 155 show`, where: name, weight: 1 });
    if (title) titles.set(title, [...(titles.get(title) ?? []), name]);
    if (description) descriptions.set(description, [...(descriptions.get(description) ?? []), name]);
    if (!/<meta\b[^>]*name=["']viewport["'][^>]*width=device-width/i.test(page.html)) search.push({ ok: false, text: "Not set up for phones (no viewport)", where: name, weight: 3 });
  }
  for (const [, where] of titles) if (where.length > 1) search.push({ ok: false, text: `The same title on ${where.join(", ")}`, weight: 1 });
  for (const [, where] of descriptions) if (where.length > 1) search.push({ ok: false, text: `The same search description on ${where.join(", ")}`, weight: 1 });
  if (!access.length) access.push({ ok: true, text: "One main heading per page, headings in order, every image described", weight: 2 });
  if (!search.some((i) => !i.ok)) search.push({ ok: true, text: "Every page has its own title and search description, and fits a phone", weight: 2 });

  const weight: QualityItem[] = [];
  for (const page of pages) {
    const bytes = new TextEncoder().encode(page.html).byteLength;
    if (bytes > PAGE_BUDGET) weight.push({ ok: false, text: `The page is ${Math.round(bytes / 1000)} KB without its images (aim for under ${PAGE_BUDGET / 1000} KB)`, where: pageName(page.path), weight: 1 });
  }
  for (const image of input.images ?? []) {
    if (image.bytes > IMAGE_BUDGET) weight.push({ ok: false, text: `An image is ${Math.round(image.bytes / 1000)} KB (aim for under ${IMAGE_BUDGET / 1000} KB)`, where: image.path, weight: 1 });
  }
  if (!weight.length) weight.push({ ok: true, text: "Light pages and images, quick on a phone", weight: 2 });

  const groups: QualityGroup[] = [
    { key: "visitor", label: "What a visitor needs at once", items: visitor },
    { key: "words", label: "Sounds like a person", items: words },
    { key: "access", label: "Accessible", items: access },
    { key: "search", label: "Found in search", items: search },
    { key: "weight", label: "Quick to load", items: weight },
  ];
  // Each problem counts once by its weight; a group with no problems counts its one passing item.
  const total = groups.flatMap((g) => g.items).reduce((sum, item) => sum + item.weight, 0);
  const passed = groups.flatMap((g) => g.items).filter((item) => item.ok).reduce((sum, item) => sum + item.weight, 0);
  const score = total ? Math.round((passed / total) * 100) : 0;
  return { level: "quality", score, verdict: score >= READY_FROM ? "ready" : score < NOT_READY_UNDER ? "not_ready" : "fix_first", groups };
}
