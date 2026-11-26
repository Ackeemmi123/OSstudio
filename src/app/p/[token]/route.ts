import { randomBytes } from "node:crypto";
import { portalDeps } from "@/server/portal/deps";
import { portalClosedPage, portalPage } from "@/server/portal/page";
import { PORTAL_TOKEN } from "@/server/portal/portal";

/**
 * A client's portal: /p/<token>. No sign-in: the long random token is the
 * key, and it expires or can be turned off. Never cached or indexed; the
 * page's one script runs under a nonce.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const nonce = randomBytes(16).toString("base64");
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  };
  const deps = portalDeps();
  if (!deps || !PORTAL_TOKEN.test(token)) return new Response(portalClosedPage(nonce), { status: 404, headers });
  const state = await deps.state(token).catch(() => null);
  if (!state) return new Response(portalClosedPage(nonce), { status: 404, headers });
  return new Response(portalPage(state, token, nonce), { status: 200, headers });
}
