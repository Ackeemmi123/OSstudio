import { describe, expect, it } from "vitest";
import { buildOffer, defaultIntro, defaultScope, euros, OFFER_WORDS, offerDate, percent, projectTitle, STANDARD_PRICES, STANDARD_VAT_PERCENT, type OfferInput } from "./offer";

const input = (over: Partial<OfferInput> = {}): OfferInput => ({
  language: "fi",
  date: "2026-11-26",
  validDays: 14,
  client: { name: "Leipomo Rantala", contact: "Liisa Rantala", email: "liisa@example.fi" },
  project: "Verkkosivusto",
  scope: defaultScope("fi", 5, 1),
  website: STANDARD_PRICES.website,
  upkeep: { monthly: STANDARD_PRICES.monthly, yearly: STANDARD_PRICES.yearly, chosen: "month" },
  extras: [],
  vatPercent: STANDARD_VAT_PERCENT,
  intro: defaultIntro("fi", "Liisa Rantala"),
  from: { studio: "Axivo", legalName: "Axivo Ab", businessId: "3663995-7", person: "Alexander Hammarén", email: "alexander.hammaren@axivo.fi", phone: "+358 40 826 6600", website: "https://axivo.fi" },
  ...over,
});

describe("an offer", () => {
  it("starts from the published prices, and works out the one-off total, VAT and upkeep", () => {
    const offer = buildOffer(input({ extras: [{ label: "Toinen kieli", price: 300, unit: "once" }, { label: " ", price: 99, unit: "once" }] }));
    expect(offer.lines.map((l) => [l.label, l.price])).toEqual([["Verkkosivusto", 1000], ["Toinen kieli", 300]]);
    expect(offer.onceTotal).toBe(1300);
    expect(offer.onceVat).toBe(331.5);
    expect(offer.recurring).toEqual({ label: "Ylläpito", price: 49, unit: "month" });
    expect(offer.validUntil).toBe("2026-12-10");
    expect(buildOffer(input({ upkeep: { monthly: 49, yearly: 490, chosen: "year" } })).recurring).toEqual({ label: "Ylläpito, vuosimaksu", price: 490, unit: "year" });
    expect(buildOffer(input({ upkeep: { monthly: 49, yearly: 490, chosen: "none" } })).recurring).toBeNull();
  });

  it("writes prices, percentages and dates as each language does", () => {
    expect(euros(1000, "fi")).toBe("1 000 €");
    expect(euros(1254.5, "sv")).toBe("1 254,50 €");
    expect(euros(1000, "en")).toBe("€1,000");
    expect(percent(25.5, "fi")).toBe("25,5");
    expect(percent(25.5, "en")).toBe("25.5");
    expect(offerDate("2026-12-10", "fi")).toBe("10. joulukuuta 2026");
    expect(offerDate("2026-12-10", "en")).toBe("10 December 2026");
  });

  it("speaks to the client by first name, in their language", () => {
    expect(defaultIntro("fi", "Liisa Rantala")).toMatch(/^Hei Liisa, ja kiitos keskustelusta\./);
    expect(defaultIntro("sv", null)).toMatch(/^Tack för samtalet\./);
    expect(defaultScope("sv", 6, 2)).toBe("Webbplats, högst 6 sidor, 2 språk.");
    expect(projectTitle("Website", "fi")).toBe("Verkkosivusto");
    expect(projectTitle("Brand and site", "fi")).toBe("Brand and site");
  });

  it("has every word in all three languages, with the published upkeep terms", () => {
    const keys = Object.keys(OFFER_WORDS.fi).sort();
    expect(Object.keys(OFFER_WORDS.sv).sort()).toEqual(keys);
    expect(Object.keys(OFFER_WORDS.en).sort()).toEqual(keys);
    expect(OFFER_WORDS.fi.upkeepTerms("49 €", "490 €")).toContain("Vähintään 12 kuukautta");
    expect(OFFER_WORDS.fi.upkeep).toContain("Pienet muutokset enintään 30 minuuttia kuukaudessa");
  });
});
