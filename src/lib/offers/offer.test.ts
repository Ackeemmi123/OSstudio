import { describe, expect, it } from "vitest";
import { buildOffer, defaultIntro, unpricedLines, defaultScope, euros, OFFER_WORDS, offerDate, offerEmail, offerMailto, percent, projectTitle, STANDARD_PRICES, STANDARD_VAT_PERCENT, type OfferInput } from "./offer";

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

  it("adds Axivo Signature's two levels as lines in the offer's language, which follow a change of language", () => {
    const extras = [
      { label: "", price: 1800, unit: "once" as const, kind: "signature" as const },
      { label: "anything typed is replaced", price: 2400, unit: "once" as const, kind: "signature-custom" as const },
    ];
    const sv = buildOffer(input({ language: "sv", extras }));
    expect(sv.lines.map((l) => [l.label, l.price])).toEqual([
      ["Webbplats", 1000],
      ["Axivo Signature: rörelse anpassad till er bransch", 1800],
      ["Axivo Signature, skräddarsydda delar enligt överenskommelse", 2400],
    ]);
    expect(sv.onceTotal).toBe(5200);
    expect(buildOffer(input({ language: "fi", extras })).lines[1].label).toBe("Axivo Signature: toimialallenne sovitettu liike");
    expect(buildOffer(input({ language: "en", extras })).lines[2].label).toBe("Axivo Signature, made-to-measure parts as agreed");
    // What the tick gives, the same six points in every language, and never what only made-to-measure work gives.
    for (const language of ["fi", "sv", "en"] as const) expect(OFFER_WORDS[language].signatureItems).toHaveLength(6);
    expect(OFFER_WORDS.sv.signatureItems.join(" ")).not.toMatch(/staplade|meny|film/i);
    expect(unpricedLines(sv)).toEqual([]);
  });

  it("is not ready while an Axivo Signature line has no price: the price is the person's to set", () => {
    const offer = buildOffer(input({ extras: [{ label: "", price: 0, unit: "once", kind: "signature" }, { label: "Toinen kieli", price: 0, unit: "once" }] }));
    expect(unpricedLines(offer).map((line) => line.kind)).toEqual(["signature"]);
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
    // The customer agreement: half on signing, half at launch, 14 days; up to five changes before launch.
    expect(OFFER_WORDS.fi.payment).toBe("50 % sopimuksen allekirjoituksen yhteydessä ja 50 %, kun sivusto on julkaistu. Maksuaika 14 päivää laskun päiväyksestä.");
    expect(OFFER_WORDS.sv.site).toContain("Upp till fem ändringar före publicering");
  });

  it("writes the e-mail that goes with the PDF, in the offer's language, with the prices and the date", () => {
    const fi = offerEmail(buildOffer(input()));
    expect(fi.to).toBe("liisa@example.fi");
    expect(fi.subject).toBe("Tarjous: Verkkosivusto");
    expect(fi.body).toBe(
      [
        "Hei Liisa,",
        "Kiitos keskustelusta. Liitteenä on tarjouksemme (Verkkosivusto).",
        "Kertamaksu 1 000 € (alv 0 %) ja ylläpito 49 €/kk (alv 0 %). Tarjous on voimassa 10. joulukuuta 2026 asti.",
        "Kun haluatte jatkaa, vastatkaa tähän viestiin, niin lähetämme sopimuksen.",
        "Terveisin\nAlexander Hammarén\nAxivo\n+358 40 826 6600",
      ].join("\n\n"),
    );
    const sv = offerEmail(buildOffer(input({ language: "sv", project: "Webbplats", upkeep: { monthly: 49, yearly: 490, chosen: "year" } })));
    expect(sv.subject).toBe("Offert: Webbplats");
    expect(sv.body).toMatch(/^Hej Liisa!\n\nTack för samtalet\./);
    expect(sv.body).toContain("Engångsavgift 1 000 € (moms 0 %) och underhåll 490 €/år (moms 0 %). Offerten gäller till 10 december 2026.");
    const en = offerEmail(buildOffer(input({ language: "en", project: "Website", client: { name: "Rantala", contact: null, email: null }, upkeep: { monthly: 49, yearly: 490, chosen: "none" } })));
    expect(en.to).toBeNull();
    expect(en.body).toMatch(/^Hello,\n\nThank you/);
    expect(en.body).toContain("One-off €1,000 (VAT 0%). The offer is valid until 10 December 2026.");
    expect(en.body).not.toContain("maintenance");
  });

  it("encodes the e-mail link so the text cannot add recipients or headers", () => {
    expect(offerMailto({ to: "liisa@example.fi", subject: "Offer & more?cc=x@evil.example", body: "A\nB&bcc=y@evil.example" })).toBe(
      "mailto:liisa%40example.fi?subject=Offer%20%26%20more%3Fcc%3Dx%40evil.example&body=A%0AB%26bcc%3Dy%40evil.example",
    );
    expect(offerMailto({ to: null, subject: "S", body: "B" })).toBe("mailto:?subject=S&body=B");
  });
});
