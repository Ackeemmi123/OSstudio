/** Taking a reviewed draft into a spec: only the chosen sections, accepted by the person, and a valid spec. */
import { describe, expect, it } from "vitest";
import { briefClient, websiteProject } from "@/lib/site-spec/test-helpers";
import { startingSpec } from "@/lib/site-spec/from-brief";
import { approvalBlockers } from "@/lib/site-spec/validate";
import { applyAndTidy, applySiteDraft, takeEverything } from "./site-draft-apply";
import { normalizeSiteDraft, type SiteDraftInput, type SiteDraftModelOutput } from "./site-draft";

const TEXT = "Testlunds Snickeri bygger kök, garderober och trappor på beställning i Borgå. Offert är alltid gratis.";
const INPUT: SiteDraftInput = { client: { name: "Testlund (test)", contactPerson: null, website: null }, projectType: "website", brief: [], sources: [{ id: "s1", label: "Mejl", type: "email", content: TEXT }], files: [] };
const empty = { text: "", refs: [], generic: false };
const label = (text: string) => ({ text, refs: [], generic: true });
const cite = (text: string) => ({ text, refs: [{ sourceId: "s1", quote: text, page: null }], generic: false });
const section = (fields: Partial<SiteDraftModelOutput["pages"][number]["sections"][number]>): SiteDraftModelOutput["pages"][number]["sections"][number] => ({
  kind: "text", variant: "single_column", eyebrow: empty, heading: empty, subheading: empty, body: empty, address: empty, hours: empty, items: [], button: null, ...fields,
});
const OUTPUT: SiteDraftModelOutput = {
  industry: "other",
  designSystem: "template",
  language: "sv",
  siteName: label("Testlunds Snickeri"),
  siteDescription: empty,
  goal: cite("Offert är alltid gratis."),
  tone: "Rak",
  audiences: [],
  primaryCta: { label: label("Kontakt"), targetPageId: "kontakt" },
  colors: { primary: "", accent: "", basis: "" },
  contactFormFields: ["name", "email", "message"],
  styles: [],
  concept: { idea: "", hero: "split", signature: "", feel: "natural", motion: "calm" },
  signature: { label: { text: "", refs: [], generic: false }, heading: { text: "", refs: [], generic: false }, text: { text: "", refs: [], generic: false }, year: "", who: "", items: [] },
  formTexts: { submitLabel: { text: "", refs: [], generic: true }, replyNote: { text: "", refs: [], generic: false } },
  pages: [
    { id: "home", title: label("Hem"), slug: "", nav: "main", seoDescription: empty, sections: [
      section({ kind: "hero", variant: "centered", heading: label("Testlunds Snickeri"), subheading: cite("bygger kök, garderober och trappor på beställning i Borgå"), button: { label: label("Kontakt"), targetPageId: "kontakt" } }),
      section({ kind: "services", variant: "cards", heading: label("Tjänster"), items: [{ title: label("Kök"), body: cite("bygger kök"), extra: empty }] }),
    ] },
    { id: "kontakt", title: label("Kontakt"), slug: "kontakt", nav: "main", seoDescription: empty, sections: [section({ kind: "contact", variant: "form_only", heading: label("Skriv till oss") })] },
  ],
  summary: "Test.",
  questions: [],
};

const client = briefClient();
const current = startingSpec(client, websiteProject(client)).spec;
const draft = normalizeSiteDraft(OUTPUT, INPUT, { runId: "run-1", projectId: "p1" });

describe("applySiteDraft", () => {
  it("takes everything and marks it accepted by the person", () => {
    const spec = applySiteDraft(current, draft, takeEverything(draft), "Anna Granskare");
    expect(spec.pages.map((p) => p.id)).toEqual(["home", "kontakt"]);
    expect(spec.locales).toEqual({ available: ["sv"], default: "sv" });
    expect(spec.pages[0].sections[1]).toMatchObject({ source: { acceptedBy: "Anna Granskare" }, items: [{ source: { acceptedBy: "Anna Granskare" } }] });
    expect(spec.strategy.goal).toMatchObject({ text: "Offert är alltid gratis.", source: { acceptedBy: "Anna Granskare" } });
    const blockers = approvalBlockers(spec, client);
    expect(blockers.map((b) => b.message)).not.toContain("A suggestion nobody has accepted is still in the spec.");
  });

  it("drops pages without chosen sections and buttons to them", () => {
    const choice = { ...takeEverything(draft), sections: new Set([draft.spec.pages[0].sections[0].id]) };
    const spec = applySiteDraft(current, draft, choice, "Anna");
    expect(spec.pages.map((p) => p.id)).toEqual(["home"]);
    expect(spec.pages[0].sections[0]).toMatchObject({ kind: "hero", buttons: [] });
    expect(spec.strategy.primaryCta).toBeUndefined();
    expect(spec.forms).toEqual([]);
  });

  it("keeps the spec's own strategy and colours when they are not taken", () => {
    const spec = applySiteDraft(current, draft, { ...takeEverything(draft), strategy: false, brand: false }, "Anna");
    expect(spec.strategy.goal).toEqual(current.strategy.goal);
    expect(spec.brand).toEqual(current.brand);
  });

  it("does not replace colours the draft did not find in the material", () => {
    const spec = applySiteDraft(current, draft, takeEverything(draft), "Anna");
    expect(spec.brand.colors).toEqual(current.brand.colors);
    expect(spec.brand.designSystem).toBe("template");
  });

  it("drops placeholder images no page uses and keeps real ones", () => {
    const withImages = {
      ...current,
      assets: [
        { id: "hero-photo", kind: "photo" as const, alt: { en: "" }, origin: "placeholder" as const, description: "The work" },
        { id: "logo", kind: "logo" as const, alt: { en: "Logo" }, origin: "client_supplied" as const, description: "The logo" },
      ],
    };
    const spec = applySiteDraft(withImages, draft, takeEverything(draft), "Anna");
    expect(spec.assets.map((a) => a.id)).toEqual(["logo"]);
  });

  it("puts the draft's form texts in place of a template's placeholders, and keeps a person's own", () => {
    const withTexts = normalizeSiteDraft({ ...OUTPUT, formTexts: { submitLabel: label("Skicka förfrågan"), replyNote: { text: "", refs: [], generic: false } } }, INPUT, { runId: "run-2", projectId: "p1" });
    const placeholders = structuredClone(current);
    placeholders.forms[0] = { ...placeholders.forms[0], submitLabel: { sv: "[The action, in 2 or 3 words]" } };
    expect(applySiteDraft(placeholders, withTexts, takeEverything(withTexts), "Alex").forms[0].submitLabel).toEqual({ sv: "Skicka förfrågan" });
    const own = structuredClone(current);
    own.forms[0] = { ...own.forms[0], submitLabel: { sv: "Boka en tid" } };
    expect(applySiteDraft(own, withTexts, takeEverything(withTexts), "Alex").forms[0].submitLabel).toEqual({ sv: "Boka en tid" });
    expect(applySiteDraft(own, withTexts, takeEverything(withTexts), "Alex").forms[0].consentText).toEqual(own.forms[0].consentText);
  });

  it("refuses to take nothing", () => {
    expect(() => applySiteDraft(current, draft, { sections: new Set(), strategy: true, brand: true }, "Anna")).toThrow("at least one section");
  });
});

describe("taking the draft and tidying up in one go", () => {
  it("fills the form's empty texts and the search descriptions, and keeps what the draft wrote", () => {
    const client = briefClient();
    const current = startingSpec(client, websiteProject(client)).spec;
    const spec = applyAndTidy(current, draft, takeEverything(draft), "Anna", { name: "Testlunds Snickeri", email: "hej@testlund.fi" });
    expect(spec.forms[0].replyNote?.sv).toBe("Meddelandet går till hej@testlund.fi. Vi svarar så snart vi kan.");
    expect(spec.forms[0].consentText.sv).toBe("Jag godkänner att mina uppgifter används för att svara på mitt meddelande.");
    const home = spec.pages.find((p) => p.id === "home")!;
    expect(home.seo.description.sv).toBe("bygger kök, garderober och trappor på beställning i Borgå");
    expect(JSON.stringify(home.sections)).toContain("Testlunds Snickeri");
  });
});
