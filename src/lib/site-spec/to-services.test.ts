import { describe, expect, it } from "vitest";
import { build } from "../../../design-systems/services";
import { siteContent } from "../../../design-systems/services/content";
import { briefClient, companySpec } from "./test-helpers";
import { publicationLine, servicesContent, signatureFor } from "./to-services";
import { approvalBlockers } from "./validate";

describe("drawing a spec with the company design", () => {
  it("maps the services template, once written, into the design's content", () => {
    const result = servicesContent(companySpec(), {}, { prototype: { madeBy: "Axivo" } });
    expect(result.ok ? [] : result.missing).toEqual([]);
    if (!result.ok) return;
    expect(siteContent.safeParse(result.content).success).toBe(true);
    expect(result.content.prototype).toEqual({ madeBy: "Axivo" });
    expect(result.content.business).toMatchObject({ email: "info@example.fi", phone: "040 123 4567" });
    expect(result.design.direction).toBe("editorial");
    const paths = build({ content: result.content, design: result.design }).map((file) => file.path);
    for (const path of Object.values(result.pages)) expect(paths).toContain(path);
  });

  it("uses the style the spec chose", () => {
    const spec = companySpec();
    spec.brand.servicesStyle = { direction: "statement", palette: "ember", motif: "pipe" };
    const result = servicesContent(spec, {}, { prototype: { madeBy: "Axivo" } });
    expect(result.ok && result.design).toMatchObject({ direction: "statement", palette: "ember", motif: "pipe" });
  });

  it("shows people and quotes only with their consent", () => {
    const spec = companySpec();
    const team = spec.pages.flatMap((p) => p.sections).find((s) => s.kind === "team");
    const quotes = spec.pages.flatMap((p) => p.sections).find((s) => s.kind === "testimonials");
    const without = servicesContent(spec, {}, { prototype: { madeBy: "Axivo" } });
    expect(without.ok && without.content.about.people).toEqual([]);
    expect(without.ok && without.content.proof.quotes).toEqual([]);
    if (team?.kind === "team") team.items.forEach((item) => (item.consent = true));
    if (quotes?.kind === "testimonials") quotes.items.forEach((item) => (item.consent = true));
    const withConsent = servicesContent(spec, {}, { prototype: { madeBy: "Axivo" } });
    if (team?.kind === "team") expect(withConsent.ok && withConsent.content.about.people.length).toBe(team.items.length);
    if (quotes?.kind === "testimonials") expect(withConsent.ok && withConsent.content.proof.quotes.length).toBeGreaterThan(0);
  });

  it("says what is missing instead of drawing a gap", () => {
    const spec = companySpec();
    spec.pages = spec.pages.filter((page) => !page.sections.some((s) => s.kind === "contact"));
    const result = servicesContent(spec, {}, { prototype: { madeBy: "Axivo" } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.missing.join(" ")).toMatch(/Contact page/);
  });

  it("blocks approval while the company design cannot draw the spec", () => {
    const spec = companySpec();
    const hero = spec.pages[0].sections.find((s) => s.kind === "hero");
    if (hero?.kind === "hero") hero.eyebrow = { sv: "" };
    expect(approvalBlockers(spec, briefClient()).map((b) => b.message)).toContain("Company design: The hero's eyebrow (who the site is for) is empty.");
  });
});

describe("the café and atelier directions from a spec", () => {
  const image = (src: string) => ({ src, width: 1600, height: 1200, source: "Client", licence: "Client's own", showsPerson: false });

  function withContactDetails() {
    const spec = companySpec();
    for (const section of spec.pages.flatMap((page) => page.sections)) {
      if (section.kind === "contact") {
        section.address = { sv: "Torggatan 4, Ekenäs" };
        section.hours = { sv: "Ti–lö 9–17, sö 10–16" };
      }
    }
    return spec;
  }

  it("takes the address and opening hours from the contact section", () => {
    const result = servicesContent(withContactDetails(), {}, { prototype: { madeBy: "Axivo" } });
    expect(result.ok && result.content.business).toMatchObject({ address: "Torggatan 4, Ekenäs", hours: "Ti–lö 9–17, sö 10–16" });
  });

  it("brings a gallery of the client's pictures to the atelier direction only", () => {
    const spec = withContactDetails();
    spec.assets.push(
      { id: "room-1", kind: "photo", alt: { sv: "Köket i villan vid havet" }, origin: "client_supplied", description: "", fileId: "11111111-1111-4111-8111-111111111111" },
      { id: "room-2", kind: "photo", alt: { sv: "Vardagsrummet i kalksten och linne" }, origin: "client_supplied", description: "", fileId: "22222222-2222-4222-8222-222222222222" },
    );
    spec.pages[0].sections.push({ id: "work", kind: "gallery", variant: "grid", heading: { sv: "Rum vi har gjort klara" }, assetIds: ["room-1", "room-2"] } as never);
    const images = { "11111111-1111-4111-8111-111111111111": image("img/1.webp"), "22222222-2222-4222-8222-222222222222": image("img/2.webp") };

    spec.brand.servicesStyle = { direction: "atelier", palette: "slate" };
    const atelier = servicesContent(spec, images, { prototype: { madeBy: "Axivo" } });
    expect(atelier.ok ? [] : atelier.missing).toEqual([]);
    if (!atelier.ok) return;
    expect(atelier.content.gallery?.items.map((item) => item.caption.text)).toEqual(["Köket i villan vid havet", "Vardagsrummet i kalksten och linne"]);
    const home = build({ content: atelier.content, design: atelier.design }).find((file) => file.path === "index.html")!.text;
    expect(home).toContain('class="work-grid"');

    spec.brand.servicesStyle = { direction: "formal", palette: "slate" };
    const formal = servicesContent(spec, images, { prototype: { madeBy: "Axivo" } });
    expect(formal.ok && formal.content.gallery).toBeUndefined();
  });
});

describe("the concept", () => {
  const P = { prototype: { madeBy: "Axivo" } } as const;

  it("carries the hero, feel and motion into the design, and draws the chosen signature", () => {
    const spec = companySpec();
    spec.brand.concept = { idea: "Händerna och årtalet.", hero: "type", signature: "year", feel: "warm", motion: "lively" };
    spec.signature = { year: { year: "1987", heading: { sv: "Sedan 1987 i samma verkstad." }, events: [{ when: "1987", text: { sv: "Verkstaden öppnar." } }, { when: "", text: { sv: "Utan år, utelämnas." } }] } };
    const result = servicesContent(spec, {}, P);
    expect(result.ok && result.design).toMatchObject({ hero: "type", signature: "year", feel: "warm", motion: "lively" });
    expect(result.ok && result.content.signature?.year).toEqual({ year: "1987", heading: { text: "Sedan 1987 i samma verkstad.", origin: "person" }, events: [{ when: "1987", text: { text: "Verkstaden öppnar.", origin: "person" } }] });
    if (result.ok) expect(build({ content: result.content, design: result.design }).find((f) => f.path === "index.html")?.text).toContain("sig--year");
  });

  it("leaves a signature out, and says why, until it is whole", () => {
    const spec = companySpec();
    const none = (id: string | undefined) => id;
    spec.brand.concept = { signature: "ownerLine" };
    spec.signature = { ownerLine: { text: { sv: "Vi svarar samma dag." }, who: "Anna (TEST)", consent: false } };
    expect(signatureFor(spec, "sv", none)).toEqual({ kind: null, reason: expect.stringContaining("agreed to be quoted") });
    const built = servicesContent(spec, {}, P);
    expect(built.ok && built.design.signature).toBeUndefined();
    spec.signature.ownerLine!.consent = true;
    expect(signatureFor(spec, "sv", none).kind).toBe("ownerLine");

    spec.brand.concept = { signature: "numbers" };
    spec.signature = { numbers: { label: { sv: "I siffror" }, items: [{ value: "214", text: { sv: "kök" }, confirmed: true }, { value: "3", text: { sv: "snickare" }, confirmed: false }] } };
    expect(signatureFor(spec, "sv", none)).toEqual({ kind: null, reason: expect.stringContaining("confirmed by the client") });
    spec.signature.numbers!.items[1].confirmed = true;
    const numbers = signatureFor(spec, "sv", none);
    expect(numbers.kind === "numbers" && numbers.content.numbers?.items.every((i) => i.text.origin === "client_confirmed")).toBe(true);

    spec.brand.concept = { signature: "everyday" };
    spec.signature = { everyday: { label: {}, heading: { sv: "En tisdag" }, items: [{ assetId: "missing", text: { sv: "Utan bild" } }] } };
    expect(signatureFor(spec, "sv", () => undefined)).toEqual({ kind: null, reason: expect.stringContaining("three") });
  });
});


describe("law and expertise: area pages, profiles and publications", () => {
  const mode = { prototype: { madeBy: "Axivo" } } as const;
  const sectionsOf = (spec: ReturnType<typeof companySpec>) => spec.pages.flatMap((p) => p.sections);

  it("gives a service with an address its own page, with who it is for and its typical matters", () => {
    const spec = companySpec();
    const services = sectionsOf(spec).find((s) => s.kind === "services");
    if (services?.kind !== "services") throw new Error("no services");
    services.items[0].slug = { sv: "patent" };
    services.items[0].whoFor = { sv: "Uppfinnare och företag som vill skydda en teknisk lösning." };
    services.items[0].matters = { sv: "Patenterbarhet\n\nIntrångsfrågor\nLicensavtal" };
    const result = servicesContent(spec, {}, mode);
    expect(result.ok ? [] : result.missing).toEqual([]);
    if (!result.ok) return;
    const page = result.content.services.items[0].page!;
    expect(page.slug).toBe("patent");
    expect(page.matters.map((m) => m.text)).toEqual(["Patenterbarhet", "Intrångsfrågor", "Licensavtal"]);
    const files = build({ content: result.content, design: result.design });
    const area = files.find((f) => f.path === "patent/index.html")!.text;
    expect(area).toContain("<h1>");
    expect(area).toContain("Typiska ärenden");
    expect(area).toContain("Uppfinnare och företag");
    expect(files.find((f) => f.path === "index.html")!.text).toContain('href="patent/"');
  });

  it("refuses a page address that is malformed or already taken", () => {
    const spec = companySpec();
    const services = sectionsOf(spec).find((s) => s.kind === "services");
    if (services?.kind !== "services") throw new Error("no services");
    services.items[0].slug = { sv: "Patent rätt" };
    const bad = servicesContent(spec, {}, mode);
    expect(bad.ok ? [] : bad.missing.join(" ")).toMatch(/page address may use only/);
    const result = servicesContent(companySpec(), {}, mode);
    if (!result.ok) throw new Error("not ok");
    services.items[0].slug = { sv: result.content.contact.slug };
    const taken = servicesContent(spec, {}, mode);
    expect(taken.ok ? [] : taken.missing.join(" ")).toMatch(/another page already uses/);
  });

  it("shows a consenting person's profile on the About page, line by line as written", () => {
    const spec = companySpec();
    const team = sectionsOf(spec).find((s) => s.kind === "team");
    if (team?.kind !== "team") throw new Error("no team");
    team.items[0].consent = true;
    team.items[0].bio = { sv: "Första stycket.\n\nAndra stycket." };
    team.items[0].education = { sv: "JD, Helsingfors universitet 1990\nJur.kand. 1982" };
    team.items[0].positions = { sv: "Ordförande, Exempelnämnden 2010–2018" };
    team.items[0].languages = { sv: "Svenska, finska, engelska, tyska" };
    const result = servicesContent(spec, {}, mode);
    expect(result.ok ? [] : result.missing).toEqual([]);
    if (!result.ok) return;
    const profile = result.content.about.people[0].profile!;
    expect(profile.bio.map((p) => p.text)).toEqual(["Första stycket.", "Andra stycket."]);
    expect(profile.education.map((p) => p.text)).toEqual(["JD, Helsingfors universitet 1990", "Jur.kand. 1982"]);
    const about = build({ content: result.content, design: result.design }).find((f) => f.path === `${result.content.about.slug}/index.html`)!.text;
    expect(about).toContain('class="profile');
    expect(about).toContain("Förtroendeuppdrag");
    expect(about).toContain("Ordförande, Exempelnämnden 2010–2018");
  });

  it("builds a publications page from a page whose address says so, keeping the order and years", () => {
    const spec = companySpec();
    spec.pages.push({
      id: "publications",
      slug: { sv: "publikationer" },
      title: { sv: "Publikationer" },
      nav: "main",
      seo: { title: {}, description: {}, noindex: false },
      sections: [
        { id: "books", kind: "text", variant: "single_column", heading: { sv: "Böcker" }, body: { sv: "2023 Licensavtalsrättens grunder. Förlag.\n2014: Patenträtt, 3 uppl.\nUtan årtal https://example.fi/a" } },
      ] as never,
    });
    const result = servicesContent(spec, {}, mode);
    expect(result.ok ? [] : result.missing).toEqual([]);
    if (!result.ok) return;
    expect(result.content.publications?.groups[0].items).toEqual([
      { text: { text: "Licensavtalsrättens grunder. Förlag.", origin: "person" }, year: "2023" },
      { text: { text: "Patenträtt, 3 uppl.", origin: "person" }, year: "2014" },
      { text: { text: "Utan årtal", origin: "person" }, href: "https://example.fi/a" },
    ]);
    expect(result.pages.publications).toBe("publikationer/index.html");
    expect(build({ content: result.content, design: result.design }).map((f) => f.path)).toContain("publikationer/index.html");
  });

  it("reads a year range and leaves a line without a year whole", () => {
    expect(publicationLine("2014–2016 Ett uppdrag")).toEqual({ text: "Ett uppdrag", year: "2014–2016" });
    expect(publicationLine("Artikel om 2020-talet")).toEqual({ text: "Artikel om 2020-talet" });
  });
});
