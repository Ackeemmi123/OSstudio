/**
 * Reads a client's public web page into text for the brief and the AI draft.
 *
 * The server fetches an address a person typed, so it must never be turned
 * into a way into private networks: only http(s) on ports 80 and 443, every
 * host name resolved and refused if any address is private, loopback or
 * link-local, redirects followed by hand and checked again, at most 2 MB of
 * HTML within 8 seconds.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 3;

export type PageText = { ok: true; url: string; title: string; text: string } | { ok: false; message: string };

/** Addresses a public web page can never be on. */
export function isPrivateAddress(address: string): boolean {
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v6 = address.toLowerCase();
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") || v6.startsWith("ff");
}

export type Resolve = (host: string) => Promise<string[]>;
const resolveHost: Resolve = async (host) => (await lookup(host, { all: true, verbatim: true })).map((entry) => entry.address);

/** Checks an address before it is fetched. Returns the URL, or why it is refused. */
export async function checkAddress(raw: string, resolve: Resolve = resolveHost): Promise<URL | string> {
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return "That is not a web address.";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "Only http and https addresses can be read.";
  if (url.username || url.password) return "Addresses with a user name or password cannot be read.";
  if (url.port && url.port !== "80" && url.port !== "443") return "Only the standard web ports can be read.";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") && !isIP(host)) return "That is not a public web address.";
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : await resolve(host);
  } catch {
    return "That address could not be found.";
  }
  if (!addresses.length || addresses.some(isPrivateAddress)) return "That is not a public web address.";
  return url;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** The readable text of an HTML page: title, description, headings and paragraphs, without scripts, styles or menus. */
export function htmlText(html: string): { title: string; text: string } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const description = decodeEntities(html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? "").trim();
  const body = (html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html.replace(/<head[\s\S]*?<\/head>|<title[\s\S]*?<\/title>/gi, " "))
    .replace(/<(script|style|noscript|svg|template|iframe|nav)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|header|footer|li|h[1-6]|tr|blockquote|figcaption)>/gi, "\n")
    .replace(/<(h[1-6])[^>]*>/gi, "\n## ")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .split("\n")
    .map((line) => line.replace(/[ \t\f\r]+/g, " ").trim())
    .filter((line, i, lines) => line && line !== "-" && line !== "##" && lines.indexOf(line) === i)
    .join("\n");
  return { title, text: [description, text].filter(Boolean).join("\n\n") };
}

async function readLimited(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    all.set(chunk, at);
    at += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function readWebPage(raw: string, deps: { fetch?: typeof fetch; resolve?: Resolve } = {}): Promise<PageText> {
  const doFetch = deps.fetch ?? fetch;
  let target: URL | string = await checkAddress(raw, deps.resolve);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (typeof target === "string") return { ok: false, message: target };
    let response: Response;
    try {
      response = await doFetch(target, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "StudioOS-material-reader/1.0" } });
    } catch {
      return { ok: false, message: "The page did not answer in time." };
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) return { ok: false, message: "The page sent a redirect without an address." };
      target = await checkAddress(new URL(next, target).toString(), deps.resolve);
      continue;
    }
    if (!response.ok) return { ok: false, message: `The page answered ${response.status}.` };
    const type = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) return { ok: false, message: "That address is not a web page." };
    const body = await readLimited(response);
    if (body === null) return { ok: false, message: "The page is larger than 2 MB." };
    const { title, text } = /text\/plain/i.test(type) ? { title: "", text: body.trim() } : htmlText(body);
    if (!text) return { ok: false, message: "No text was found on the page." };
    return { ok: true, url: target.toString(), title: title || target.hostname, text };
  }
  return { ok: false, message: "The page redirected too many times." };
}
