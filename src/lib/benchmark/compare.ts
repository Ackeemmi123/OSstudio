/**
 * The client's site beside its competitors, criterion by criterion, with
 * what to fix where a competitor does better. Pure: no network, no database.
 */
import type { PageFacts } from "./analyze";

/** Google PageSpeed Insights, mobile. Scores 0–100. */
export interface SpeedFacts {
  performance: number | null;
  accessibility: number | null;
  seo: number | null;
  /** Largest contentful paint: when the main content is visible. */
  lcpSeconds: number | null;
}

export interface MeasuredSite {
  kind: "ours" | "competitor";
  /** What the person entered, or the client's own link. */
  url: string;
  page: PageFacts | null;
  /** Why the page could not be read, in plain words. */
  error: string | null;
  speed: SpeedFacts | null;
  /** Why there is no speed, when there is none (for example: not published yet). */
  speedNote: string | null;
}

type Value = boolean | number | null;

interface Criterion {
  key: string;
  label: string;
  /** A boolean (true is better), or a number with a direction. */
  read: (site: MeasuredSite) => Value;
  better?: "higher" | "lower";
  /** Shown when we are behind. */
  fix: string;
}

const page = <T,>(read: (p: PageFacts) => T) => (site: MeasuredSite) => (site.page ? read(site.page) : null);
const speed = (read: (s: SpeedFacts) => number | null) => (site: MeasuredSite) => (site.speed ? read(site.speed) : null);

export const CRITERIA: Criterion[] = [
  { key: "phone", label: "Phone number on the home page", read: page((p) => p.phone), fix: "Show the phone number on the home page, as a link that calls." },
  { key: "email", label: "Email address", read: page((p) => p.email), fix: "Show an email address on the home page." },
  { key: "address", label: "Address", read: page((p) => p.address), fix: "Show the street address on the home page, if visitors come to you." },
  { key: "hours", label: "Opening hours", read: page((p) => p.hours), fix: "Show the opening hours on the home page, if the client has them." },
  { key: "prices", label: "Prices", read: page((p) => p.prices), fix: "A competitor shows prices. Ask the client whether you may show a starting price." },
  { key: "form", label: "Contact form", read: page((p) => p.form), fix: "Add a contact form to the home page." },
  { key: "heading", label: "A main heading that says something", read: page((p) => p.heading.trim().length >= 12), fix: "Write a main heading that says what the client does and for whom." },
  { key: "description", label: "Search description", read: page((p) => p.hasDescription), fix: "Write the search description under SEO." },
  { key: "mobile", label: "Made for phones", read: page((p) => p.mobileLayout), fix: "The site is not set up for phones." },
  { key: "https", label: "Secure address (https)", read: page((p) => p.https), fix: "Publish the site on an https address." },
  { key: "plain", label: "No stock web phrases", read: page((p) => p.stockPhrases.length === 0), fix: "Replace the stock phrases with the client's own words." },
  { key: "alt", label: "Every image described", read: page((p) => (p.images ? p.imagesWithoutText === 0 : null)), fix: "Describe every image that is not decoration." },
  { key: "speed", label: "Speed on a phone (0–100)", read: speed((s) => s.performance), better: "higher", fix: "A competitor loads faster. Make the images smaller and check what slows the first screen." },
  { key: "lcp", label: "Main content visible (seconds)", read: speed((s) => s.lcpSeconds), better: "lower", fix: "A competitor shows its main content sooner. Make the first image smaller." },
  { key: "a11y", label: "Accessibility (0–100)", read: speed((s) => s.accessibility), better: "higher", fix: "A competitor scores higher on accessibility. Open the PageSpeed report for details." },
];

export type Standing = "ahead" | "level" | "behind" | "unknown";

export interface ComparisonRow {
  key: string;
  label: string;
  /** Ours first, then each competitor in order. */
  values: Value[];
  standing: Standing;
}

export interface Comparison {
  rows: ComparisonRow[];
  ahead: number;
  behind: number;
  /** What to fix, where a competitor does better. */
  fixes: { key: string; text: string; by: string[] }[];
}

/** 1 when a is better than b, -1 when worse, 0 when equal or not comparable. */
function versus(a: Value, b: Value, better: Criterion["better"]): number {
  if (a === null || b === null) return 0;
  if (typeof a === "boolean" || typeof b === "boolean") return a === b ? 0 : a ? 1 : -1;
  // Small differences in a score are noise from one measurement.
  const margin = better === "lower" ? 0.3 : 5;
  if (Math.abs(a - b) < margin) return 0;
  return (better === "lower" ? a < b : a > b) ? 1 : -1;
}

export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function compareSites(ours: MeasuredSite, competitors: MeasuredSite[]): Comparison {
  const rows: ComparisonRow[] = [];
  const fixes: Comparison["fixes"] = [];
  let ahead = 0;
  let behind = 0;
  for (const criterion of CRITERIA) {
    const mine = criterion.read(ours);
    const theirs = competitors.map((c) => criterion.read(c));
    const results = theirs.map((t) => versus(mine, t, criterion.better));
    const known = mine !== null && theirs.some((t) => t !== null);
    const standing: Standing = !known ? "unknown" : results.some((r) => r < 0) ? "behind" : results.some((r) => r > 0) ? "ahead" : "level";
    if (standing === "ahead") ahead++;
    if (standing === "behind") {
      behind++;
      fixes.push({ key: criterion.key, text: criterion.fix, by: competitors.filter((_, i) => results[i] < 0).map((c) => hostOf(c.url)) });
    }
    rows.push({ key: criterion.key, label: criterion.label, values: [mine, ...theirs], standing });
  }
  return { rows, ahead, behind, fixes };
}
