/**
 * Does a company-design site look like another site from the same studio?
 * Two sites in the same direction and palette, with mostly the same concept
 * choices, read as the same template with other words. Studio OS says so,
 * names the other client and suggests what to change. Pure: no database.
 */
import type { SiteSpec } from "./schema";

/** The design choices that decide how a company-design site looks. */
export interface DesignFingerprint {
  direction: string;
  palette: string;
  type: string;
  motif: string;
  hero: string;
  signature: string;
  feel: string;
  motion: string;
}

/** Another site of the studio, as far as its look goes. */
export interface OtherDesign {
  projectId: string;
  clientId: string;
  clientName: string;
  brand: SiteSpec["brand"];
}

const CONCEPT_KEYS = ["type", "motif", "hero", "signature", "feel", "motion"] as const;

const LABELS: Record<(typeof CONCEPT_KEYS)[number], string> = {
  type: "lettering",
  motif: "motif",
  hero: "first screen",
  signature: "signature part",
  feel: "photo treatment",
  motion: "movement",
};

/** The look of a company-design brand; null for other designs. Unset choices count as the direction's own. */
export function fingerprintOf(brand: SiteSpec["brand"]): DesignFingerprint | null {
  if (brand.designSystem !== "services@0.1") return null;
  const style = brand.servicesStyle ?? { direction: "editorial", palette: "pine" };
  const concept = brand.concept ?? {};
  return {
    direction: style.direction,
    palette: style.palette,
    type: style.type ?? "",
    motif: style.motif ?? "",
    hero: concept.hero ?? "split",
    signature: concept.signature ?? "",
    feel: concept.feel ?? "natural",
    motion: concept.motion ?? "calm",
  };
}

export interface Likeness {
  other: OtherDesign;
  /** The choices the two share, in plain words. */
  shared: string[];
  /** "same": nearly the same site. "close": same direction and colours, some choices differ. */
  level: "same" | "close";
}

/**
 * The studio's sites this one looks like, closest first. A site is close when it shares the
 * direction and palette; it is the same when it also shares at least four of the six concept choices.
 */
export function lookAlikes(mine: SiteSpec["brand"], others: readonly OtherDesign[], projectId: string): Likeness[] {
  const a = fingerprintOf(mine);
  if (!a) return [];
  const found: (Likeness & { score: number })[] = [];
  for (const other of others) {
    if (other.projectId === projectId) continue;
    const b = fingerprintOf(other.brand);
    if (!b || a.direction !== b.direction || a.palette !== b.palette) continue;
    const same = CONCEPT_KEYS.filter((key) => a[key] === b[key]);
    found.push({
      other,
      shared: ["direction", "colours", ...same.map((key) => LABELS[key])],
      level: same.length >= 4 ? "same" : "close",
      score: same.length,
    });
  }
  return found.sort((x, y) => y.score - x.score).map(({ other, shared, level }) => ({ other, shared, level }));
}

/** What to change first, so the two sites part ways most visibly. */
export function suggestion(likeness: Likeness): string {
  const shared = new Set(likeness.shared);
  if (shared.has("signature part")) return "Choose another signature part, or another palette.";
  if (shared.has("first screen")) return "Choose another first screen, or another palette.";
  return "Choose another palette.";
}
