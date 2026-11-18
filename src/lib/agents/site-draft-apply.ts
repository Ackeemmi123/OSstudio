/**
 * Takes a reviewed website draft into a project's spec. The person picks
 * which sections to take; taking them is accepting them, so their proposal
 * sources get `acceptedBy`. Pages left without sections, and buttons to
 * them, are dropped. Images, typography and other choices already in the
 * spec are kept; pages, texts and forms come from the draft. Placeholder
 * images that no page uses any more are dropped; real images stay.
 */
import type { SiteSpec, SiteSpecSection, SiteSpecSource } from "@/lib/site-spec/schema";
import { siteSpecSchema } from "@/lib/site-spec/schema";
import { assetIdsOf } from "@/lib/site-spec/validate";
import type { SiteDraftResult } from "./site-draft";

export interface DraftChoice {
  /** Section ids to take. */
  sections: ReadonlySet<string>;
  /** Take the goal, audiences, tone and main button. */
  strategy: boolean;
  /** Take the design system and colours. */
  brand: boolean;
}

/** Everything in the draft, as the starting choice of the review. */
export function takeEverything(draft: SiteDraftResult): DraftChoice {
  return { sections: new Set(draft.spec.pages.flatMap((p) => p.sections.map((s) => s.id))), strategy: true, brand: true };
}

function accept<T extends { source?: SiteSpecSource }>(part: T, by: string): T {
  return part.source?.kind === "proposal" ? { ...part, source: { ...part.source, acceptedBy: by.slice(0, 120) } } : part;
}

function acceptSection(section: SiteSpecSection, by: string): SiteSpecSection {
  const taken = accept(section, by);
  return "items" in taken ? ({ ...taken, items: (taken.items as { source?: SiteSpecSource }[]).map((item) => accept(item, by)) } as SiteSpecSection) : taken;
}

export function applySiteDraft(current: SiteSpec, draft: SiteDraftResult, choice: DraftChoice, acceptedBy: string): SiteSpec {
  const from = draft.spec;
  let pages = from.pages
    .map((page) => ({ ...page, sections: page.sections.filter((s) => choice.sections.has(s.id)).map((s) => acceptSection(s, acceptedBy)) }))
    .filter((page) => page.sections.length > 0);
  if (pages.length === 0) throw new Error("Choose at least one section to take.");

  // Buttons may only point at pages that are still there; a call to action without one is dropped.
  const ids = new Set(pages.map((p) => p.id));
  pages = pages.map((page) => ({
    ...page,
    sections: page.sections.flatMap((s): SiteSpecSection[] => {
      if (s.kind === "cta") return ids.has(s.button.targetPageId) ? [s] : [];
      if ("buttons" in s) return [{ ...s, buttons: s.buttons.filter((b) => ids.has(b.targetPageId)) } as SiteSpecSection];
      return [s];
    }),
  }));
  const hasContact = pages.some((p) => p.sections.some((s) => s.kind === "contact"));

  const strategy = choice.strategy
    ? {
        goal: accept(from.strategy.goal, acceptedBy),
        audiences: from.strategy.audiences.map((a) => accept(a, acceptedBy)),
        tone: from.strategy.tone,
        ...(from.strategy.primaryCta && ids.has(from.strategy.primaryCta.targetPageId) ? { primaryCta: from.strategy.primaryCta } : {}),
      }
    : {
        ...current.strategy,
        primaryCta: current.strategy.primaryCta && ids.has(current.strategy.primaryCta.targetPageId) ? current.strategy.primaryCta : undefined,
      };
  if (!strategy.primaryCta) delete strategy.primaryCta;

  // Colours only when the draft found them in the material; otherwise the spec keeps its own.
  const brand = choice.brand
    ? accept(
        {
          ...current.brand,
          designSystem: from.brand.designSystem,
          ...(from.brand.source ? { colors: { ...current.brand.colors, primary: from.brand.colors.primary, ...(from.brand.colors.accent ? { accent: from.brand.colors.accent } : {}) }, source: from.brand.source } : {}),
        },
        acceptedBy,
      )
    : current.brand;

  // A consent text or reply note a person already wrote for the contact form is kept.
  const own = current.forms.find((f) => f.id === "contact-form");
  const forms = hasContact ? from.forms.map((f) => (own && f.id === own.id ? { ...f, consentText: own.consentText, ...(own.replyNote ? { replyNote: own.replyNote } : {}), ...(own.submitLabel ? { submitLabel: own.submitLabel } : {}) } : f)) : [];

  const used = new Set([...pages.flatMap((p) => p.sections.flatMap(assetIdsOf)), ...(brand.logoAssetId ? [brand.logoAssetId] : [])]);
  const assets = current.assets.filter((asset) => asset.origin !== "placeholder" || used.has(asset.id));

  return siteSpecSchema.parse({
    ...current,
    assets,
    locales: from.locales,
    strategy,
    brand,
    pages,
    forms,
    seo: from.seo,
  });
}
