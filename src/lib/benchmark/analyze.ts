/**
 * What a visitor finds on a home page, read from its HTML: the things a small
 * business's site must answer at once (how to call, write, find and visit
 * it, what it costs, how to get in touch) and the craft behind them (a clear
 * heading, a search description, a mobile layout, image descriptions, plain
 * words instead of stock web copy). The same reading is applied to the
 * client's site and to its competitors, so they can be compared fairly.
 * Pure: no network, no database.
 */
import { STOCK_PHRASES } from "@/lib/site-spec/industries";

export interface PageFacts {
  url: string;
  https: boolean;
  title: string;
  heading: string;
  hasDescription: boolean;
  mobileLayout: boolean;
  language: string | null;
  phone: boolean;
  email: boolean;
  address: boolean;
  hours: boolean;
  prices: boolean;
  form: boolean;
  /** Stock web phrases found in the visible text. */
  stockPhrases: string[];
  images: number;
  imagesWithoutText: number;
  words: number;
}

const decode = (text: string) =>
  text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

/** The text a visitor reads: scripts, styles, comments and tags removed. */
export function visibleText(html: string): string {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function firstMatch(html: string, pattern: RegExp): string {
  const found = pattern.exec(html)?.[1] ?? "";
  return visibleText(found).slice(0, 200);
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return match ? (match[2] ?? match[3] ?? match[4] ?? "") : null;
}

const PHONE = /(?:\+358|\+46|\b0)[\s-]?\d{1,3}(?:[\s-]?\d{2,4}){2,3}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
/** A five-digit postal code beside a word, as Finnish and Swedish addresses are written. */
const ADDRESS = /\b\d{5}\s+\p{Lu}\p{L}+|\p{L}+(?:gatan|vägen|gränd|torget|katu|tie|kuja|tori|road|street)\s+\d+/u;
const WEEKDAYS =
  /\b(mån(?:dag)?|tis(?:dag)?|ons(?:dag)?|tors(?:dag)?|fre(?:dag)?|lör(?:dag)?|sön(?:dag)?|vardagar|maanantai|tiistai|keskiviikko|torstai|perjantai|lauantai|sunnuntai|ma|ti|ke|to|pe|la|su|arkisin|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|weekdays)\b/i;
const TIME = /\b\d{1,2}(?:[.:]\d{2})?\s*(?:[-–]|to|till|until)\s*\d{1,2}(?:[.:]\d{2})?\b/i;
const PRICE = /(?:€\s?\d|\d[\d\s.,]*\s?(?:€|eur\b|euro|kr\b|sek\b))/i;

/** The facts of one page. `url` is where it was read from, after redirects. */
export function analyzePage(html: string, url: string): PageFacts {
  const text = visibleText(html);
  const head = /<head\b[\s\S]*?<\/head>/i.exec(html)?.[0] ?? html.slice(0, 20_000);
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const meta = (name: string) => metas.find((tag) => attribute(tag, "name")?.toLowerCase() === name || attribute(tag, "property")?.toLowerCase() === name);
  const description = meta("description") ?? meta("og:description");
  const images = (html.match(/<img\b[^>]*>/gi) ?? []).filter((tag) => !/\bwidth\s*=\s*["']?1["'\s>]/i.test(tag));
  const lower = text.toLocaleLowerCase("sv");
  const hoursNearby = (() => {
    for (const match of text.matchAll(new RegExp(WEEKDAYS.source, "gi"))) {
      const around = text.slice(Math.max(0, (match.index ?? 0) - 40), (match.index ?? 0) + 80);
      if (TIME.test(around)) return true;
    }
    return false;
  })();
  return {
    url,
    https: url.startsWith("https://"),
    title: firstMatch(html, /<title\b[^>]*>([\s\S]*?)<\/title>/i),
    heading: firstMatch(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/i),
    hasDescription: Boolean(description && (attribute(description, "content") ?? "").trim().length >= 30),
    mobileLayout: Boolean(meta("viewport") && /width\s*=\s*device-width/i.test(attribute(meta("viewport")!, "content") ?? "")),
    language: attribute(/<html\b[^>]*>/i.exec(html)?.[0] ?? "", "lang")?.slice(0, 10) || null,
    phone: /href\s*=\s*["']tel:/i.test(html) || PHONE.test(text),
    email: /href\s*=\s*["']mailto:/i.test(html) || EMAIL.test(text),
    address: ADDRESS.test(text),
    hours: hoursNearby,
    prices: PRICE.test(text),
    form: /<form\b/i.test(html),
    stockPhrases: STOCK_PHRASES.filter(({ pattern }) => pattern.test(lower)).map(({ phrase }) => phrase),
    images: images.length,
    // alt="" marks a decorative image, which is right; a missing alt is not.
    imagesWithoutText: images.filter((tag) => attribute(tag, "alt") === null && attribute(tag, "role") !== "presentation").length,
    words: text ? text.split(" ").length : 0,
  };
}
