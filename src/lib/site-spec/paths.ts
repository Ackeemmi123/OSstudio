/**
 * Where a problem lives in the editor. A blocker's path goes down to a field
 * ("pages.0.sections.1.heading.sv"); the editor marks what it draws with
 * data-spec-path, and a click goes to the closest thing that is marked.
 */
import { SITE_LOCALES, type SiteLocale } from "./catalog";

/** The path, then each of its parents. */
export function pathCandidates(path: string): string[] {
  const parts = path.split(".").filter(Boolean);
  return parts.map((_, i) => parts.slice(0, parts.length - i).join("."));
}

/** The index of the page a path is inside, if any. */
export function pageIndexOfPath(path: string): number | null {
  const match = /^pages\.(\d+)(\.|$)/.exec(path);
  return match ? Number(match[1]) : null;
}

/** The language a path's field is written in, if any. */
export function localeOfPath(path: string): SiteLocale | null {
  const last = path.split(".").at(-1);
  return (SITE_LOCALES as readonly string[]).includes(last ?? "") ? (last as SiteLocale) : null;
}
