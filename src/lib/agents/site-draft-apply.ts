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
import { fillSearchDescriptions, fillStandardTexts } from "@/lib/site-spec/quick-fills";

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
        ...(from.strategy.industry ? { industry: from.strategy.industry } : {}),
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
          ...(from.brand.servicesStyle ? { servicesStyle: from.brand.servicesStyle, styleProposals: from.brand.styleProposals } : {}),
          ...(from.brand.concept ? { concept: from.brand.concept } : {}),
          ...(from.brand.source ? { colors: { ...current.brand.colors, primary: from.brand.colors.primary, ...(from.brand.colors.accent ? { accent: from.brand.colors.accent } : {}) }, source: from.brand.source } : {}),
        },
        acceptedBy,
      )
    : current.brand;

  // A consent text or reply note a person already wrote for the contact form is kept.
  // A person's own form texts stay; a template's placeholders give way to the draft's.
  const own = current.forms.find((f) => f.id === "contact-form");
  const written = (text: Partial<Record<string, string>> | undefined) => Boolean(text && Object.values(text).some((v) => v?.trim() && !v.includes("[")));
  const forms = hasContact
    ? from.forms.map((f) =>
        own && f.id === own.id ? { ...f, consentText: own.consentText, ...(written(own.replyNote) ? { replyNote: own.replyNote } : {}), ...(written(own.submitLabel) ? { submitLabel: own.submitLabel } : {}) } : f,
      )
    : [];

  const used = new Set([...pages.flatMap((p) => p.sections.flatMap(assetIdsOf)), ...(brand.logoAssetId ? [brand.logoAssetId] : [])]);
  const assets = current.assets.filter((asset) => asset.origin !== "placeholder" || used.has(asset.id));

  // The signature's facts come with the concept; taking the brand accepts them, as with sections.
  const signature = choice.brand && from.signature ? accept(from.signature, acceptedBy) : current.signature;

  return siteSpecSchema.parse({
    ...current,
    ...(signature ? { signature } : {}),
    assets,
    locales: from.locales,
    strategy,
    brand,
    pages,
    forms,
    seo: from.seo,
  });
}

/**
 * The draft taken in, then tidied as a person would right after: the studio's
 * standard form and privacy texts where the draft left them empty (when the
 * client has an e-mail), and search descriptions from each page's own words.
 * Nothing the draft wrote is replaced.
 */
export function applyAndTidy(current: SiteSpec, draft: SiteDraftResult, choice: DraftChoice, acceptedBy: string, client: { name: string; email: string | null }): SiteSpec {
  let spec = applySiteDraft(current, draft, choice, acceptedBy);
  spec = fillStandardTexts(spec, client)?.spec ?? spec;
  return fillSearchDescriptions(spec).spec;
}
