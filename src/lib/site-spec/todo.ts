/**
 * What is left before approval, as a list a person can work through: one entry
 * per field however many languages it is missing in, grouped by where the work
 * is, most important first. A template's first draft has dozens of these, so a
 * page with many is split into its sections, and only where to start stays open.
 */
import { localeOfPath, pageIndexOfPath } from "./paths";
import { SECTION_LABELS } from "./catalog";
import type { SiteSpec, SiteSpecPage, SiteSpecSection } from "./schema";
import { isPlaceholderText, pageLabel } from "./texts";
import type { SpecIssue } from "./validate";

export interface ProblemGroup {
  key: string;
  label: string;
  /** Why this group needs more than writing. */
  note?: string;
  /** Where to start: open even when the list is long. */
  first?: boolean;
  items: SpecIssue[];
}

/** A page with more than this to do is split into its sections. */
const SPLIT_PAGE_OVER = 8;
const NAMED_BY_KIND = new Set<SiteSpecSection["kind"]>(["hero", "faq", "contact"]);

const PRIVACY_PAGE = "privacy";

/** A section's name in the list: its heading, what its heading's instruction asks for, or its type. */
function sectionName(section: SiteSpecSection, page: SiteSpecPage, locale: string): string {
  const kind = SECTION_LABELS[section.kind].label;
  const sameKind = page.sections.filter((other) => other.kind === section.kind);
  const fallback = sameKind.length > 1 ? `${kind} ${sameKind.indexOf(section) + 1}` : kind;
  const heading = section.heading[locale as keyof typeof section.heading]?.trim();
  if (NAMED_BY_KIND.has(section.kind) || !heading) return fallback;
  return isPlaceholderText(heading) ? heading.slice(1, -1).split(/[,:]/)[0].trim() : heading.slice(0, 48);
}

function groupOf(spec: SiteSpec, path: string, split: ReadonlySet<number>): { key: string; order: number; label: string; note?: string; first?: boolean } {
  const legal = { key: "legal", order: 1000, label: "Privacy and consent", note: "Placeholders only. These need client-specific details and legal review." };
  const search = { key: "search", order: 2000, label: "Search texts and site name" };
  const page = pageIndexOfPath(path);
  if (page !== null) {
    const target = spec.pages[page];
    if (target?.id === PRIVACY_PAGE) return legal;
    if (path.startsWith(`pages.${page}.seo`)) return search;
    const inSection = /^pages\.\d+\.sections\.(\d+)(\.|$)/.exec(path);
    const index = inSection ? Number(inSection[1]) : null;
    const section = index !== null ? target?.sections[index] : undefined;
    const label = target ? pageLabel(spec, target, page) : "Pages";
    if (target && section && index !== null && split.has(page)) {
      return { key: `page-${target.id}-${section.id}`, order: 10 + page + (index + 1) / 100, label: `${label} › ${sectionName(section, target, spec.locales.default)}`, first: page === 0 && index === 0 };
    }
    return { key: `page-${target?.id ?? page}`, order: 10 + page, label };
  }
  if (path.startsWith("forms")) return legal;
  if (path.startsWith("seo")) return search;
  if (path.startsWith("assets")) return { key: "images", order: 500, label: "Images" };
  return { key: "start", order: 0, label: "Start here: goal and brand", first: true };
}

export function groupProblems(spec: SiteSpec, issues: readonly SpecIssue[]): ProblemGroup[] {
  const seen = new Set<string>();
  const once = issues.filter((issue) => {
    // The same message on the same field, in another language, is one thing to do.
    const field = localeOfPath(issue.path) ? issue.path.slice(0, issue.path.lastIndexOf(".")) : issue.path;
    const key = `${field}|${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const perPage = new Map<number, number>();
  for (const { path } of once) {
    const page = pageIndexOfPath(path);
    if (page !== null && !path.startsWith(`pages.${page}.seo`)) perPage.set(page, (perPage.get(page) ?? 0) + 1);
  }
  const split = new Set([...perPage].filter(([, count]) => count > SPLIT_PAGE_OVER).map(([page]) => page));
  const groups = new Map<string, ProblemGroup & { order: number }>();
  for (const issue of once) {
    const { key, order, label, note, first } = groupOf(spec, issue.path, split);
    const group = groups.get(key) ?? { key, order, label, note, first, items: [] };
    group.items.push(issue);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}
