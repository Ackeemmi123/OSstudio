import "server-only";
import { connect } from "node:tls";

export interface SiteHealth {
  ok: boolean;
  /** What a person should know, in plain words; empty when all is well. */
  problems: string[];
  status: number | null;
  ms: number | null;
  certDaysLeft: number | null;
  wwwOk: boolean | null;
}

/** Days left on the certificate the host presents for this name; null when it cannot be read. */
export function certificateDaysLeft(host: string, now = Date.now()): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      const valid = socket.authorized && cert?.valid_to ? Math.floor((Date.parse(cert.valid_to) - now) / 86_400_000) : null;
      socket.end();
      resolve(valid);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

async function answers(url: string, fetchImpl: typeof fetch): Promise<{ status: number | null; ms: number; location: string | null }> {
  const started = Date.now();
  try {
    const response = await fetchImpl(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Studio OS health check" } });
    return { status: response.status, ms: Date.now() - started, location: response.headers.get("location") };
  } catch {
    return { status: null, ms: Date.now() - started, location: null };
  }
}

/**
 * Whether a live site answers as a visitor expects: its address returns a
 * page over https with a valid certificate that does not run out within two
 * weeks, and www (for a domain) leads to it.
 */
export async function checkSite(site: { url: string; domain: string | null }, deps: { fetch?: typeof fetch; certDays?: (host: string) => Promise<number | null> } = {}): Promise<SiteHealth> {
  const fetchImpl = deps.fetch ?? fetch;
  const certDays = deps.certDays ?? ((host: string) => certificateDaysLeft(host));
  const problems: string[] = [];
  const main = await answers(site.url, fetchImpl);
  if (main.status === null) problems.push(`${site.url} does not answer.`);
  else if (main.status >= 400) problems.push(`${site.url} answers with error ${main.status}.`);
  else if (main.ms > 5000) problems.push(`${site.url} took ${Math.round(main.ms / 1000)} seconds to answer.`);

  let certDaysLeft: number | null = null;
  let wwwOk: boolean | null = null;
  if (site.domain) {
    certDaysLeft = await certDays(site.domain);
    if (certDaysLeft === null) problems.push(`The certificate for ${site.domain} is missing or not valid.`);
    else if (certDaysLeft < 14) problems.push(`The certificate for ${site.domain} runs out in ${certDaysLeft} days.`);
    const www = await answers(`https://www.${site.domain}/`, fetchImpl);
    wwwOk = www.status !== null && ((www.status >= 300 && www.status < 400 && (www.location ?? "").includes(site.domain)) || (www.status >= 200 && www.status < 300));
    if (!wwwOk) problems.push(`www.${site.domain} does not lead to the site.`);
  }
  return { ok: problems.length === 0, problems, status: main.status, ms: main.status === null ? null : main.ms, certDaysLeft, wwwOk };
}
