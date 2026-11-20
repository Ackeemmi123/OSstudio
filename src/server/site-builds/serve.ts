/**
 * Serves one stored build behind its link, /s/<token>/<path>. The pages a
 * design system writes link from the site's root ("/om-oss/"), so their root
 * links are moved under the link's prefix on the way out. Expired and
 * turned-off links answer 410 with a page in the agency's own brand (never
 * Studio OS's); a page that is not there answers the build's own 404 page.
 */
import type { ShownBrand } from "@/lib/domain/agency-brand";
import { reviewBar, withReviewBar } from "@/server/site-reviews/bar";
import { contentTypeOf } from "./build";

export interface ServedBuild {
  storagePrefix: string;
  expiresAt: string;
  revokedAt: string | null;
}

export interface ServeDeps {
  find: (token: string) => Promise<ServedBuild | null>;
  read: (path: string) => Promise<Uint8Array | null>;
  now: () => Date;
  /** The brand of the agency that owns a studio, for the pages of expired and turned-off links. */
  brand?: (studioId: string) => Promise<ShownBrand | null>;
  /** The agency's brand when the link is open for review, so its pages get the review bar; null otherwise. */
  review?: (token: string) => Promise<ShownBrand | null>;
}

const TOKEN = /^[A-Za-z0-9_-]{32,64}$/;
const HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};

/** The file a request asks for: a folder means its index page; nothing may climb out of the build. */
export function filePath(segments: readonly string[]): string | null {
  if (segments.some((segment) => segment === ".." || segment === "." || segment.includes("\\") || segment.includes("\0"))) return null;
  const joined = segments.filter(Boolean).join("/");
  if (!joined) return "index.html";
  return /\.[a-z0-9]{2,5}$/i.test(joined) ? joined : `${joined}/index.html`;
}

/** Root links and sources ("/x/", "/img/a.jpg") moved under the link's prefix. */
export function underPrefix(html: string, prefix: string): string {
  return html.replace(/\b(href|src)="\/(?!\/)/g, `$1="${prefix}/`);
}

function text(status: number, message: string) {
  return new Response(message, { status, headers: { ...HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[c]};`);

/** A small page in the agency's brand: its name, logo and colour, and how to reach it. */
export function brandedPage(status: number, brand: ShownBrand, heading: string, message: string): Response {
  const name = escapeHtml(brand.name);
  const color = /^#[0-9A-Fa-f]{6}$/.test(brand.color) ? brand.color : "#1F2A37";
  const logo = brand.logoUrl && /^https:\/\//.test(brand.logoUrl) ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" style="max-height:48px;max-width:200px">` : `<strong style="color:${color};font-size:20px">${name}</strong>`;
  const contact = [
    brand.email ? `<a href="mailto:${escapeHtml(brand.email)}" style="color:${color}">${escapeHtml(brand.email)}</a>` : "",
    brand.website ? `<a href="${escapeHtml(brand.website)}" style="color:${color}" rel="noopener">${escapeHtml(brand.website.replace(/^https:\/\//, ""))}</a>` : "",
  ].filter(Boolean);
  const html = `<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${escapeHtml(heading)} · ${name}</title></head>
<body style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1A1A1A;background:#FAFAF8">
<main style="max-width:520px;margin:12vh auto;padding:0 24px">
<div style="border-top:4px solid ${color};padding-top:24px">${logo}</div>
<h1 style="font-size:22px;margin:28px 0 8px">${escapeHtml(heading)}</h1>
<p style="font-size:16px;line-height:1.5;margin:0 0 16px">${escapeHtml(message)}</p>
${contact.length ? `<p style="font-size:15px;line-height:1.6;margin:0">${contact.join("<br>")}</p>` : ""}
</main></body></html>`;
  return new Response(html, { status, headers: { ...HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}

const CLOSED = {
  revoked: { sv: "Länken är avstängd", en: "This link has been turned off" },
  expired: { sv: "Länken har gått ut", en: "This link has expired" },
} as const;

async function closed(build: ServedBuild, deps: ServeDeps, why: keyof typeof CLOSED) {
  const brand = deps.brand ? await deps.brand(build.storagePrefix.split("/")[0]).catch(() => null) : null;
  const { sv, en } = CLOSED[why];
  if (!brand) return text(410, `${en}. Ask for a new one.`);
  return brandedPage(410, brand, `${sv} · ${en}`, `Be ${brand.name} om en ny länk. Ask ${brand.name} for a new one.`);
}

/**
 * Pins relative links to the page's own folder. Next.js serves /s/<token>/om-oss/
 * without its closing slash, so a design that links relatively (./site.css,
 * ../kontakt/) would otherwise resolve one folder too high.
 */
export function withBase(html: string, prefix: string, file: string): string {
  const folder = file.includes("/") ? file.slice(0, file.lastIndexOf("/") + 1) : "";
  const tag = `<base href="${prefix}/${folder}">`;
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}${tag}`) : html;
}

export async function serveBuild(token: string, segments: readonly string[], deps: ServeDeps): Promise<Response> {
  if (!TOKEN.test(token)) return text(404, "This link does not exist.");
  const build = await deps.find(token);
  if (!build) return text(404, "This link does not exist.");
  if (build.revokedAt) return closed(build, deps, "revoked");
  if (new Date(build.expiresAt) <= deps.now()) return closed(build, deps, "expired");
  const path = filePath(segments);
  if (!path) return text(400, "This address is not allowed.");

  const prefix = `/s/${token}`;
  let status = 200;
  let file = path;
  let body = await deps.read(`${build.storagePrefix}/${path}`);
  if (!body) {
    status = 404;
    file = "404.html";
    body = await deps.read(`${build.storagePrefix}/404.html`);
    if (!body) return text(404, "This page does not exist.");
  }
  const type = contentTypeOf(file);
  let out: Uint8Array = body;
  if (type.startsWith("text/html")) {
    let html = withBase(underPrefix(new TextDecoder().decode(body), prefix), prefix, file);
    const brand = deps.review ? await deps.review(token).catch(() => null) : null;
    if (brand) html = withReviewBar(html, reviewBar(token, brand));
    out = new TextEncoder().encode(html);
  }
  return new Response(out as BodyInit, { status, headers: { ...HEADERS, "Content-Type": type } });
}
