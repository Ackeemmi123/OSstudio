import "server-only";
import { build as buildAssociation } from "../../../design-systems/association";
import { build as buildServices } from "../../../design-systems/services";
import { siteQuality, type QualityReport } from "@/lib/quality/site-quality";
import type { SiteSpec } from "@/lib/site-spec/schema";
import { servicesContent } from "@/lib/site-spec/to-services";

/**
 * The quality gate on a spec before it is built: its pages drawn with its own
 * design, without images, and scored as a build would be. An unfinished draft
 * scores low for what is still to write, which is the point. Null for the
 * Studio OS template, which only previews.
 */
export function draftQuality(spec: SiteSpec, madeBy: string): QualityReport | { missing: string[] } | null {
  const system = spec.brand.designSystem;
  if (system === "services@0.1") {
    const result = servicesContent(spec, {}, { prototype: { madeBy } });
    if (!result.ok) return { missing: result.missing };
    const files = buildServices({ content: result.content, design: result.design });
    return siteQuality({ pages: files.filter((f) => f.path.endsWith(".html")).map((f) => ({ path: f.path, html: f.text })), industry: spec.strategy.industry });
  }
  if (system === "association@0.1") {
    const files = buildAssociation(spec, { files: {}, documents: {}, status: "prototype", today: new Date(), madeBy });
    return siteQuality({ pages: files.filter((f) => f.path.endsWith(".html")).map((f) => ({ path: f.path, html: f.text })), industry: spec.strategy.industry });
  }
  return null;
}
