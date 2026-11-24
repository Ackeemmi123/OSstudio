import { describe, expect, it } from "vitest";
import { monthlyReport, previousMonth } from "./report";

const base = {
  locale: "sv" as const,
  client: "Förvaltningssällskapet",
  studio: "Axivo",
  siteUrl: "https://forvaltningssallskapet.fi",
  month: "2026-12-01",
  facts: { checks: 31, checksOk: 31, forms: 4, formsBefore: 1, published: [] },
  speed: { performance: 97, accessibility: 100, lcpSeconds: 1.4 },
  quality: 92,
  portalUrl: null,
};

describe("the monthly report", () => {
  it("says in Swedish that the site was up, how quick it is, and how many messages came", () => {
    const { subject, text } = monthlyReport(base);
    expect(subject).toBe("Förvaltningssällskapet: månadsrapport för webbplatsen, december 2026");
    expect(text).toContain("Här är månadsrapporten för er webbplats forvaltningssallskapet.fi: december 2026.");
    expect(text).toContain("Webbplatsen: uppe hela månaden (31 dagliga kontroller).");
    expect(text).toContain("Hastighet på mobil: 97/100, huvudinnehållet syns efter 1,4 sekunder.");
    expect(text).toContain("Meddelanden via formulären: 4 (månaden innan: 1).");
    expect(text).toContain("Ändringar: inga den här månaden.");
    expect(text).toMatch(/Hälsningar\nAxivo$/);
  });

  it("is honest about checks that failed, and leaves out what was not measured", () => {
    const { text } = monthlyReport({ ...base, facts: { ...base.facts, checksOk: 30 }, speed: null, quality: null });
    expect(text).toContain("uppe vid 96,8 % av kontrollerna (30/31)");
    expect(text).not.toContain("Hastighet");
    expect(text).not.toContain("kvalitetskontroll");
  });

  it("speaks Finnish and English, and points to the client's portal when there is one", () => {
    expect(monthlyReport({ ...base, locale: "fi", portalUrl: "https://studio.example/p/x" }).text).toContain("Kertokaa siitä sivullanne https://studio.example/p/x");
    expect(monthlyReport({ ...base, locale: "en" }).subject).toBe("Förvaltningssällskapet: your website's monthly report, December 2026");
  });

  it("reports on the month before", () => {
    expect(previousMonth("2027-01-01")).toBe("2026-12-01");
    expect(previousMonth("2026-12-01")).toBe("2026-11-01");
  });
});
