import "server-only";
import type { SpeedFacts } from "@/lib/benchmark/compare";

/**
 * Speed, accessibility and search scores on a phone, from Google PageSpeed
 * Insights. Only public addresses are sent: competitors' sites and the
 * client's published site, never a private review link. An API key
 * (PAGESPEED_API_KEY) raises Google's daily limit; without one it still works
 * for a few comparisons a day.
 */
export async function measureSpeed(url: string, fetchImpl: typeof fetch = fetch): Promise<{ speed: SpeedFacts | null; note: string | null }> {
  const query = new URLSearchParams({ url, strategy: "mobile" });
  for (const category of ["performance", "accessibility", "seo"]) query.append("category", category);
  const key = process.env.PAGESPEED_API_KEY?.trim();
  if (key) query.set("key", key);
  let response: Response;
  try {
    response = await fetchImpl(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${query}`, { signal: AbortSignal.timeout(90_000) });
  } catch {
    return { speed: null, note: "Google's speed test did not finish in time." };
  }
  if (response.status === 429) {
    return {
      speed: null,
      note: key
        ? "Google's speed test has reached this studio's daily limit. Try again tomorrow."
        : "Google's shared daily limit is used up. An administrator can add a free PageSpeed API key to the server (PAGESPEED_API_KEY) so speed is measured every time.",
    };
  }
  if (!response.ok) return { speed: null, note: "Google's speed test could not read this page." };
  const body = (await response.json().catch(() => null)) as {
    lighthouseResult?: { categories?: Record<string, { score?: number | null }>; audits?: Record<string, { numericValue?: number }> };
  } | null;
  const result = body?.lighthouseResult;
  if (!result) return { speed: null, note: "Google's speed test gave no result." };
  const score = (name: string) => {
    const value = result.categories?.[name]?.score;
    return typeof value === "number" ? Math.round(value * 100) : null;
  };
  const lcp = result.audits?.["largest-contentful-paint"]?.numericValue;
  return {
    speed: { performance: score("performance"), accessibility: score("accessibility"), seo: score("seo"), lcpSeconds: typeof lcp === "number" ? Math.round(lcp / 100) / 10 : null },
    note: null,
  };
}
