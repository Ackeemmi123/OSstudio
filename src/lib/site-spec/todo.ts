/**
 * What is left before approval, as a list a person can work through: one entry
 * per field however many languages it is missing in, grouped by where the work
 * is, most important first. A template's first draft has dozens of these.
 */
import { localeOfPath, pageIndexOfPath } from "./paths";
import type { SiteSpec } from "./schema";
import { pageLabel } from "./texts";
import type { SpecIssue } from "./validate";

export interface ProblemGroup {
  key: string;
  label: string;
  /** Why this group needs more than writing. */
  note?: string;
  items: SpecIssue[];
}

const PRIVACY_PAGE = "privacy";

function groupOf(spec: SiteSpec, path: string): { key: string; order: number; label: string; note?: string } {
  const legal = { key: "legal", order: 1000, label: "Privacy and consent", note: "Placeholders only. These need client-specific details and legal review." };
  const search = { key: "search", order: 2000, label: "Search texts and site name" };
  const page = pageIndexOfPath(path);
  if (page !== null) {
    const target = spec.pages[page];
    if (target?.id === PRIVACY_PAGE) return legal;
    if (path.startsWith(`pages.${page}.seo`)) return search;
    return { key: `page-${target?.id ?? page}`, order: 10 + page, label: target ? pageLabel(spec, target, page) : "Pages" };
  }
  if (path.startsWith("forms")) return legal;
  if (path.startsWith("seo")) return search;
  if (path.startsWith("assets")) return { key: "images", order: 500, label: "Images" };
  return { key: "start", order: 0, label: "Start here: goal and brand" };
}

export function groupProblems(spec: SiteSpec, issues: readonly SpecIssue[]): ProblemGroup[] {
  const groups = new Map<string, ProblemGroup & { order: number }>();
  const seen = new Set<string>();
  for (const issue of issues) {
    // The same message on the same field, in another language, is one thing to do.
    const field = localeOfPath(issue.path) ? issue.path.slice(0, issue.path.lastIndexOf(".")) : issue.path;
    const once = `${field}|${issue.message}`;
    if (seen.has(once)) continue;
    seen.add(once);
    const { key, order, label, note } = groupOf(spec, issue.path);
    const group = groups.get(key) ?? { key, order, label, note, items: [] };
    group.items.push(issue);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}
