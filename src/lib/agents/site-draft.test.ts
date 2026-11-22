/** The checks on a website draft: every text has a source, nothing invented survives, and the result is a valid spec. */
import { describe, expect, it } from "vitest";
import { approvalBlockers } from "@/lib/site-spec/validate";
import { draftTexts, normalizeSiteDraft, pdfPageCount, siteDraftFingerprint, slugify, styleChoice, type SiteDraftInput, type SiteDraftModelOutput } from "./site-draft";
import { applySiteDraft, takeEverything } from "./site-draft-apply";
import { styleOptions } from "@/components/site-spec/style-comparison";
import { readFileSync } from "node:fs";
import { SITE_DRAFT_PROMPT_VERSION, SITE_DRAFT_SYSTEM_PROMPT, siteDraftBytes } from "./site-draft-prompt";

const MINUTES = "Protokoll 4/26. Sällskapet håller vårbal den 12 april 2026 på Arken. Styrelsen: ordförande Anna Testsson, kassör Bo Exempel.";
const INPUT: SiteDraftInput = {
  client: { name: "Testsällskapet (test)", contactPerson: null, website: null },
  projectType: "website",
  brief: [{ target: "goal", value: "Fler nya medlemmar varje höst", confidence: "observed" }],
  sources: [{ id: "src-1", label: "Protokoll 4/26", type: "document", content: MINUTES }],
  files: [{ id: "file-1", title: "Webbmaterial", mimeType: "application/pdf", sha256: "a".repeat(64), data: "JVBERi0=", pages: 4 }],
};
const RUN = { runId: "run-1", projectId: "project-1" };

const empty = { text: "", refs: [], generic: false };
const label = (text: string) => ({ text, refs: [], generic: true });
const cite = (text: string, sourceId: string, quote = text, page: number | null = null) => ({ text, refs: [{ sourceId, quote, page }], generic: false });
const section = (fields: Partial<SiteDraftModelOutput["pages"][number]["sections"][number]>): SiteDraftModelOutput["pages"][number]["sections"][number] => ({
  kind: "text", variant: "single_column", eyebrow: empty, heading: empty, subheading: empty, body: empty, address: empty, hours: empty, items: [], button: null, ...fields,
});

function output(overrides: Partial<SiteDraftModelOutput> = {}): SiteDraftModelOutput {
  return {
    industry: "other",
    designSystem: "association@0.1",
    language: "sv",
    siteName: label("Testsällskapet"),
    siteDescription: empty,
    goal: cite("Fler nya medlemmar varje höst", "brief-goal"),
    tone: "Varm och saklig",
    audiences: [cite("Nya studenter", "file-1", "nya studenter", 2)],
    primaryCta: { label: label("Bli medlem"), targetPageId: "bli-medlem" },
    colors: { primary: "#8a1c2b", accent: "nope", basis: "logon" },
    contactFormFields: ["name", "email", "message"],
    styles: [],
    formTexts: { submitLabel: { text: "", refs: [], generic: true }, replyNote: { text: "", refs: [], generic: false } },
    pages: [
      {
        id: "start",
        title: label("Hem"),
        slug: "",
        nav: "main",
        seoDescription: empty,
        sections: [
          section({ kind: "hero", variant: "centered", heading: label("Testsällskapet"), subheading: cite("Vårbal den 12 april 2026 på Arken", "src-1", "vårbal den 12 april 2026 på Arken"), button: { label: label("Bli medlem"), targetPageId: "bli-medlem" } }),
          section({ heading: label("Om oss"), body: { text: "Grundat 1850 med över 3000 medlemmar.", refs: [], generic: false } }),
          section({ body: cite("Ett påhittat citat", "src-1", "detta står inte i protokollet") }),
          section({ kind: "team", variant: "grid", heading: label("Styrelsen"), items: [{ title: cite("Anna Testsson", "src-1"), body: empty, extra: cite("Ordförande", "src-1", "ordförande Anna Testsson") }, { title: { text: "Påhittad Person", refs: [], generic: false }, body: empty, extra: label("Sekreterare") }] }),
          section({ kind: "cta", variant: "banner", heading: label("Häng med"), body: empty, button: { label: label("Till ingenstans"), targetPageId: "finns-inte" } }),
        ],
      },
      { id: "Bli medlem!", title: label("Bli medlem"), slug: "Bli Medlem", nav: "main", seoDescription: empty, sections: [section({ kind: "contact", variant: "form_only", heading: label("Ansök") })] },
    ],
    summary: "Ett testutkast.",
    questions: ["Vilka bilder får vi använda?", " "],
    ...overrides,
  };
}

describe("normalizeSiteDraft", () => {
  const result = normalizeSiteDraft(output(), INPUT, RUN);
  const spec = result.spec;

  it("keeps texts whose quotes are in the material and drops invented ones", () => {
    const home = spec.pages[0];
    expect(home.sections[0]).toMatchObject({ kind: "hero", subheading: { sv: "Vårbal den 12 april 2026 på Arken" } });
    expect(home.sections[1]).toMatchObject({ kind: "text", heading: { sv: "Om oss" }, body: { sv: "" } });
    expect(home.sections[2]).toMatchObject({ body: { sv: "" } });
    expect(result.dropped.map((d) => d.text)).toEqual(expect.arrayContaining(["Grundat 1850 med över 3000 medlemmar.", "Ett påhittat citat", "Påhittad Person"]));
  });

  it("drops people the material does not name", () => {
    expect(spec.pages[0].sections[3]).toMatchObject({ kind: "team", items: [{ name: "Anna Testsson", role: { sv: "Ordförande" } }] });
  });

  it("accepts a cited PDF page without checking it, and records every source", () => {
    expect(spec.strategy.audiences).toEqual([{ id: "audience-1", text: "Nya studenter", source: { kind: "proposal", runId: "run-1", proposalId: "audience-1" } }]);
    expect(result.provenance["strategy.audiences.0"]).toEqual([{ sourceId: "file-1", sourceLabel: "Webbmaterial", quote: "nya studenter", page: 2, checked: false }]);
    expect(result.provenance["strategy.goal"]).toEqual([expect.objectContaining({ sourceId: "brief-goal", checked: true })]);
  });

  it("gives every text in the spec a source or a generic mark", () => {
    for (const { path } of draftTexts(spec)) {
      const covered = path.endsWith(".") ? Object.keys(result.provenance).some((key) => key.startsWith(path)) : path in result.provenance;
      expect(covered, path).toBe(true);
    }
  });

  it("makes page ids, slugs and buttons that fit the spec", () => {
    expect(spec.pages.map((p) => [p.id, p.slug])).toEqual([
      ["home", { sv: "" }],
      ["bli-medlem", { sv: "bli-medlem" }],
    ]);
    expect(spec.strategy.primaryCta).toEqual({ label: { sv: "Bli medlem" }, targetPageId: "bli-medlem" });
    expect(spec.pages[0].sections[0]).toMatchObject({ buttons: [{ targetPageId: "bli-medlem" }] });
    // A button to a page that does not exist is dropped; a call to action without one becomes text.
    expect(spec.pages[0].sections[4]).toMatchObject({ kind: "text", heading: { sv: "Häng med" } });
    expect(spec.forms).toEqual([expect.objectContaining({ id: "contact-form", fields: ["name", "email", "message"] })]);
    expect(spec.brand).toMatchObject({ designSystem: "association@0.1", colors: { primary: "#8A1C2B" } });
    expect(spec.brand.colors.accent).toBeUndefined();
  });

  it("marks everything as a proposal, so the spec cannot be approved before review", () => {
    const blockers = approvalBlockers(spec, { id: "client-1", context: {} as never });
    expect(blockers.filter((b) => b.message === "A suggestion nobody has accepted is still in the spec.").length).toBeGreaterThan(5);
  });

  it("drops a too long text instead of cutting it", () => {
    const long = "x".repeat(130);
    const r = normalizeSiteDraft(output({ pages: [{ ...output().pages[0], sections: [section({ heading: cite(long, "src-1", "Protokoll 4/26") })] }] }), INPUT, RUN);
    expect(r.spec.pages[0].sections[0]).toMatchObject({ heading: { sv: "" } });
  });

  it("refuses an answer of the wrong shape or without pages", () => {
    expect(() => normalizeSiteDraft({ pages: "no" }, INPUT, RUN)).toThrow();
    expect(() => normalizeSiteDraft(output({ pages: [] }), INPUT, RUN)).toThrow();
  });

  it("keeps clean questions", () => {
    expect(result.questions).toEqual(["Vilka bilder får vi använda?"]);
  });
});

describe("style proposals for the company design", () => {
  const styles: SiteDraftModelOutput["styles"] = [
    { direction: "editorial", palette: "timber", type: "", motif: "", reason: "Varm och hantverksmässig, som ekköken." },
    { direction: "editorial", palette: "timber", type: "", motif: "", reason: "A duplicate." },
    { direction: "formal", palette: "navy", type: "grotesk", motif: "courses", reason: "Etablerad och seriös." },
    { direction: "statement", palette: "hazard", type: "wide", motif: "", reason: "Rak och kraftfull." },
    { direction: "statement", palette: "signal", type: "", motif: "", reason: "A fourth one." },
    { direction: "formal", palette: "pine", type: "", motif: "", reason: "  " },
  ];

  it("keeps three distinct proposals with reasons, and starts with the first", () => {
    const chosen = styleChoice(styles);
    expect(chosen.styleProposals).toEqual([
      { direction: "editorial", palette: "timber", reason: "Varm och hantverksmässig, som ekköken." },
      { direction: "formal", palette: "navy", motif: "courses", reason: "Etablerad och seriös." },
      { direction: "statement", palette: "hazard", type: "wide", reason: "Rak och kraftfull." },
    ]);
    expect(chosen.servicesStyle).toEqual({ direction: "editorial", palette: "timber" });
    expect(styleChoice([]).styleProposals).toHaveLength(3);
  });

  it("keeps only styles that suit the kind of business, and fills up from its profile", () => {
    const law = styleChoice(styles, "law_finance");
    expect(law.styleProposals?.map((p) => `${p.direction}/${p.palette}`)).toEqual(["formal/navy", "formal/oxblood", "editorial/slate"]);
    // The model's formal/navy came with a masonry motif, which does not suit a law firm: the profile's own style replaces it.
    expect(law.styleProposals?.[0]).toMatchObject({ motif: "scale", reason: "A starting style for law, accounting and finance." });
    const fitting = styleChoice([{ direction: "formal", palette: "oxblood", type: "", motif: "scale", reason: "Lugn och trovärdig." }], "law_finance");
    expect(fitting.styleProposals?.[0]).toEqual({ direction: "formal", palette: "oxblood", motif: "scale", reason: "Lugn och trovärdig." });
    const cafe = styleChoice([], "cafe_restaurant");
    expect(cafe.styleProposals?.map((p) => `${p.direction}/${p.palette}`)).toEqual(["cafe/terracotta", "cafe/forest", "editorial/plum"]);
    expect(cafe.styleProposals?.every((p) => !p.motif)).toBe(true);
  });

  it("records the kind of business in the spec", () => {
    expect(normalizeSiteDraft(output({ industry: "cafe_restaurant" }), INPUT, RUN).spec.strategy.industry).toBe("cafe_restaurant");
  });

  it("puts them in the spec only for the company design, and carries them when the draft is applied", () => {
    const company = normalizeSiteDraft(output({ designSystem: "services@0.1", styles }), INPUT, RUN).spec;
    expect(company.brand.styleProposals).toHaveLength(3);
    expect(company.brand.servicesStyle).toEqual({ direction: "editorial", palette: "timber" });
    expect(normalizeSiteDraft(output({ styles }), INPUT, RUN).spec.brand.styleProposals).toBeUndefined();
    const draft = normalizeSiteDraft(output({ designSystem: "services@0.1", styles }), INPUT, RUN);
    const current = normalizeSiteDraft(output(), INPUT, RUN).spec;
    const applied = applySiteDraft(current, draft, takeEverything(draft), "Alex");
    expect(applied.brand.styleProposals).toEqual(company.brand.styleProposals);
    expect(applied.brand.servicesStyle).toEqual(company.brand.servicesStyle);
  });

  it("offers the kind of business's starting styles, or the three directions, when the spec has no proposals", () => {
    const spec = normalizeSiteDraft(output({ designSystem: "services@0.1" }), INPUT, RUN).spec;
    delete spec.brand.styleProposals;
    delete spec.strategy.industry;
    expect(styleOptions(spec)).toMatchObject({ proposed: false, options: [{ style: { direction: "editorial" } }, { style: { direction: "formal" } }, { style: { direction: "statement" } }] });
    spec.strategy.industry = "law_finance";
    expect(styleOptions(spec).options.map((o) => o.style.palette)).toEqual(["navy", "oxblood", "slate"]);
    expect(styleOptions(normalizeSiteDraft(output({ designSystem: "services@0.1", styles }), INPUT, RUN).spec).proposed).toBe(true);
  });
});

describe("the client's own answers", () => {
  it("are named in the draft's instructions exactly as the review link stores them", () => {
    const label = "Svar på frågor via granskningslänken";
    expect(readFileSync("supabase/migrations/20261126000100_site_build_questions.sql", "utf8")).toContain(label);
    expect(SITE_DRAFT_SYSTEM_PROMPT).toContain(label);
    expect(SITE_DRAFT_SYSTEM_PROMPT).toMatch(/never by you/);
  });
});

describe("site draft helpers", () => {
  it("makes slugs from Nordic text", () => {
    expect(slugify("Om Förvaltningssällskapet & oss")).toBe("om-forvaltningssallskapet-oss");
  });

  it("counts PDF pages", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 1 0 obj <</Type /Pages /Count 2>> 2 0 obj <</Type /Page>> 3 0 obj <</Type/Page /Parent 1 0 R>>");
    expect(pdfPageCount(pdf)).toBe(2);
  });

  it("changes the fingerprint when the material changes", async () => {
    const a = await siteDraftFingerprint(INPUT, SITE_DRAFT_PROMPT_VERSION);
    expect(await siteDraftFingerprint(INPUT, SITE_DRAFT_PROMPT_VERSION)).toBe(a);
    expect(await siteDraftFingerprint({ ...INPUT, files: [{ ...INPUT.files[0], sha256: "b".repeat(64) }] }, SITE_DRAFT_PROMPT_VERSION)).not.toBe(a);
  });

  it("counts PDF pages generously when reserving the budget", () => {
    expect(siteDraftBytes(INPUT)).toBeGreaterThan(4 * 3000);
  });
});
