/**
 * The first draft of a project's SiteSpec, built from the client's brief.
 *
 * Only confirmed brief values are copied, each with its source, so an
 * approved spec never rests on something the client has not confirmed.
 * Values that exist but are not confirmed are listed for the person to
 * confirm in the brief first; they are not copied.
 */
import type { Client, ContextFieldKey, Project } from "@/lib/domain/types";
import { ACCESSIBILITY_TARGET } from "./catalog";
import { SITE_SPEC_VERSION, type SiteSpec, type SiteSpecSource } from "./schema";

/** Brief values the starting draft uses. */
export const STARTING_BRIEF_FIELDS = ["goal", "targetAudience", "offering"] as const satisfies readonly ContextFieldKey[];

export interface StartingSpec {
  spec: SiteSpec;
  /** Brief values that have a value but are not confirmed yet, so they were left out. */
  unconfirmed: ContextFieldKey[];
}

function confirmed(client: Client, field: ContextFieldKey): { value: string; source: SiteSpecSource } | null {
  const value = client.context[field];
  if (value.confidence !== "confirmed" || !value.value?.trim() || !value.confirmedAt) return null;
  return { value: value.value.trim(), source: { kind: "brief", field, confirmedAt: value.confirmedAt } };
}

export function startingSpec(client: Client, project: Pick<Project, "projectType">): StartingSpec {
  const unconfirmed = STARTING_BRIEF_FIELDS.filter((field) => client.context[field].value !== null && !confirmed(client, field));
  const goal = confirmed(client, "goal");
  const audience = confirmed(client, "targetAudience");
  const offering = confirmed(client, "offering");
  const store = project.projectType === "ecommerce" || project.projectType === "website_ecommerce";

  const spec: SiteSpec = {
    specVersion: SITE_SPEC_VERSION,
    locales: { available: ["en"], default: "en" },
    strategy: {
      goal: goal ? { text: goal.value.slice(0, 1000), source: goal.source } : { text: "" },
      audiences: audience ? [{ id: "audience-1", text: audience.value.slice(0, 300), source: audience.source }] : [],
      primaryCta: { label: { en: "Contact us" }, targetPageId: "contact" },
      tone: "",
    },
    // Neutral placeholders with good contrast. No source: a person must choose the brand before approval.
    brand: {
      colors: { primary: "#1F4E79", background: "#FFFFFF", text: "#1A1A1A", neutral: ["#F4F4F4", "#D9D9D9", "#737373"] },
      typography: { heading: { family: "Inter", weight: 700 }, body: { family: "Inter", weight: 400 }, scale: "1.25" },
      radius: "soft",
      density: "regular",
    },
    assets: [],
    pages: [
      {
        id: "home",
        slug: { en: "" },
        title: { en: "Home" },
        nav: "main",
        seo: { title: { en: client.name.slice(0, 60) }, description: { en: "" }, noindex: false },
        sections: [
          { id: "home-hero", kind: "hero", variant: "centered", heading: { en: "" }, subheading: { en: "" }, buttons: [{ label: { en: "Contact us" }, targetPageId: "contact" }] },
          offering
            ? { id: "home-offering", kind: "text", variant: "single_column", heading: { en: "" }, body: { en: offering.value.slice(0, 4000) }, source: offering.source }
            : { id: "home-offering", kind: "text", variant: "single_column", heading: { en: "" }, body: { en: "" } },
        ],
      },
      {
        id: "contact",
        slug: { en: "contact" },
        title: { en: "Contact" },
        nav: "main",
        seo: { title: { en: "Contact" }, description: { en: "" }, noindex: false },
        sections: [{ id: "contact-form", kind: "contact", variant: "form_and_details", heading: { en: "Get in touch" }, body: { en: "" }, formId: "contact-form" }],
      },
    ],
    forms: [{ id: "contact-form", purpose: "contact", fields: ["name", "email", "message"], consentText: { en: "" }, recipient: "client_contact" }],
    integrations: {
      analytics: { enabled: false },
      maps: { enabled: false },
      booking: { enabled: false },
      newsletter: { enabled: false },
      store: { enabled: store },
    },
    seo: { siteName: { en: client.name.slice(0, 60) }, defaultDescription: { en: "" }, structuredData: "LocalBusiness" },
    accessibility: { target: ACCESSIBILITY_TARGET },
  };
  return { spec, unconfirmed };
}
