import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Reads a public web page for the competitor comparison. The address comes
 * from a person, so the server only goes to public hosts on the usual ports:
 * never to this machine, a private network or a cloud metadata address, and
 * every redirect is checked the same way. Only HTML is read, up to a size and
 * time limit.
 */
export const PAGE_LIMITS = { bytes: 2 * 1024 * 1024, timeoutMs: 10_000, redirects: 4 } as const;

export class PageError extends Error {}

function ipv4Private(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** Whether an address is not on the public internet. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) return ipv4Private(ip);
  const v6 = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v6)?.[1];
  if (mapped) return ipv4Private(mapped);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6) || v6.startsWith("64:ff9b:") || v6.startsWith("2001:db8:");
}

/** Checks an address a person typed, and makes it a full URL. */
export function publicUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`);
  } catch {
    throw new PageError("This is not a web address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new PageError("Only web addresses (http or https) can be compared.");
  if (url.username || url.password) throw new PageError("Web addresses with a name or password cannot be compared.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new PageError("Only web addresses on the usual ports can be compared.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(".") || /\.(local|internal|localhost|lan|home|corp)$/.test(host) || host === "localhost") throw new PageError("Only public web addresses can be compared.");
  if (isIP(host) && isPrivateAddress(host)) throw new PageError("Only public web addresses can be compared.");
  url.hash = "";
  return url;
}

async function assertPublicHost(url: URL) {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new PageError("This address does not exist.");
  });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new PageError("Only public web addresses can be compared.");
}

/** The page's HTML and the address it ended at, after redirects. */
export async function fetchPublicPage(input: string, fetchImpl: typeof fetch = fetch): Promise<{ url: string; html: string }> {
  let url = publicUrl(input);
  const signal = AbortSignal.timeout(PAGE_LIMITS.timeoutMs);
  for (let hop = 0; hop <= PAGE_LIMITS.redirects; hop++) {
    await assertPublicHost(url);
    let response: Response;
    try {
      response = await fetchImpl(url, {
        redirect: "manual",
        signal,
        headers: { "user-agent": "Mozilla/5.0 (compatible; StudioOS-Compare/1.0)", accept: "text/html,application/xhtml+xml" },
      });
    } catch {
      throw new PageError("The page did not answer in time.");
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) throw new PageError("The page redirected nowhere.");
      url = publicUrl(new URL(next, url).toString());
      continue;
    }
    if (!response.ok) throw new PageError(`The page answered with an error (${response.status}).`);
    if (!/html/i.test(response.headers.get("content-type") ?? "")) throw new PageError("The address is not a web page.");
    const reader = response.body?.getReader();
    if (!reader) throw new PageError("The page was empty.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > PAGE_LIMITS.bytes) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return { url: url.toString(), html: new TextDecoder().decode(Buffer.concat(chunks)) };
  }
  throw new PageError("The page redirected too many times.");
}
