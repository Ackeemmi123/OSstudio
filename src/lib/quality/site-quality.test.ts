import { describe, expect, it } from "vitest";
import { siteQuality } from "./site-quality";

const page = (body: string, head = "") =>
  `<!doctype html><html lang="sv"><head><title>Mätbageriet i Åbo</title><meta name="description" content="Surdegsbröd och tårtor på beställning, bakade varje morgon vid torget i Åbo."><meta name="viewport" content="width=device-width, initial-scale=1">${head}</head><body>${body}</body></html>`;

const good = page(
  `<h1>Surdegsbröd från vedugnen vid torget</h1><p>Vi bakar varje morgon från klockan fem. Ring 040 123 4567 eller skriv till hej@matbageriet.fi.</p><p>Torggatan 3, 20100 Åbo. Mån–fre 7–17, lör 8–14.</p><h2>Beställ en tårta</h2><form action="/send"><input name="namn"></form>`,
);

describe("the quality gate", () => {
  it("passes a site that gives a visitor what they need, in a person's words", () => {
    const report = siteQuality({ pages: [{ path: "index.html", html: good }], industry: "cafe_restaurant" });
    expect(report.groups.flatMap((g) => g.items).filter((i) => !i.ok)).toEqual([]);
    expect(report.score).toBe(100);
    expect(report.verdict).toBe("ready");
  });

  it("finds what a template or an AI leaves behind, and what a visitor misses", () => {
    const bad = page(`<h1>Välkommen</h1><p>Vi brinner för kvalitet och service! I en värld där allt går fort! Klart! Bra! [Skriv om oss]</p><h3>Mer</h3><a href="/om">Läs mer</a>`);
    const report = siteQuality({ pages: [{ path: "index.html", html: bad }], industry: "cafe_restaurant" });
    const failed = report.groups.flatMap((g) => g.items).filter((i) => !i.ok).map((i) => i.text).join(" | ");
    expect(failed).toMatch(/phone number or e-mail/);
    expect(failed).toMatch(/A main heading that says something/);
    expect(failed).toMatch(/Opening hours/);
    expect(failed).toMatch(/Draft text/);
    expect(failed).toMatch(/Stock web phrases: brinner för, kvalitet och service/);
    expect(failed).toMatch(/AI-written: i en värld där/);
    expect(failed).toMatch(/heading level is skipped \(h1 to h3\)/);
    expect(failed).toMatch(/Links that say only "Läs mer"/);
    expect(report.verdict).toBe("not_ready");
  });

  it("finds the same title or sentence on several pages, and heavy images", () => {
    const sentence = "Vi bakar allt själva varje morgon med mjöl från gårdar i Egentliga Finland.";
    const a = page(`<h1>Bröd från vedugnen</h1><p>${sentence} Ring 040 123 4567.</p><form></form>`);
    const b = page(`<h1>Om bageriet</h1><p>${sentence}</p>`);
    const report = siteQuality({ pages: [{ path: "index.html", html: a }, { path: "om-oss/index.html", html: b }], images: [{ path: "bilder/a.webp", bytes: 900_000 }] });
    const failed = report.groups.flatMap((g) => g.items).filter((i) => !i.ok).map((i) => i.text).join(" | ");
    expect(failed).toMatch(/same sentence on several pages/);
    expect(failed).toMatch(/same title on Home, om-oss/);
    expect(failed).toMatch(/An image is 900 KB/);
  });
});
