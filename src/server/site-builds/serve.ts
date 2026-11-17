/**
 * Serves one stored build behind its link, /s/<token>/<path>. The pages a
 * design system writes link from the site's root ("/om-oss/"), so their root
 * links are moved under the link's prefix on the way out. Expired and
 * turned-off links answer 410; a page that is not there answers the build's
 * own 404 page.
 */
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

export async function serveBuild(token: string, segments: readonly string[], deps: ServeDeps): Promise<Response> {
  if (!TOKEN.test(token)) return text(404, "This link does not exist.");
  const build = await deps.find(token);
  if (!build) return text(404, "This link does not exist.");
  if (build.revokedAt) return text(410, "This link has been turned off.");
  if (new Date(build.expiresAt) <= deps.now()) return text(410, "This link has expired. Ask for a new one.");
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
  const out = type.startsWith("text/html") ? new TextEncoder().encode(underPrefix(new TextDecoder().decode(body), prefix)) : body;
  return new Response(out as BodyInit, { status, headers: { ...HEADERS, "Content-Type": type } });
}
