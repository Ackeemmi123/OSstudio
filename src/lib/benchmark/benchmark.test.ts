import { describe, expect, it } from "vitest";
import { analyzePage, visibleText } from "./analyze";
import { compareSites, type MeasuredSite } from "./compare";

const CAFE = `<!doctype html><html lang="sv"><head><title>Kafé Testgränd (TEST)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="Ett litet kafé vid torget i Ekenäs, med soppa varje dag och bröd vi bakar själva.">
<style>.x{color:red}</style><script>var hidden = "brinner för";</script></head>
<body><h1>Soppa, bröd &amp; <em>kaffe</em> vid torget</h1>
<p>Öppet måndag–fredag 8–16, lördag 9–14.</p><p>Torget 3, 10600 Ekenäs</p>
<p>Dagens soppa 9,50 €</p><a href="tel:+35840000000">Ring oss</a><a href="mailto:hej@example.fi">Mejla</a>
<img src="a.jpg" alt="Soppa i en skål"><img src="b.jpg" alt=""><form action="/s"></form></body></html>`;

const COMPETITOR = `<html><head><title>Kahvila</title></head><body><h1>Välkommen</h1>
<p>Vi brinner för kaffe och erbjuder skräddarsydda lösningar för alla tillfällen.</p><img src="c.jpg"></body></html>`;

describe("reading a page", () => {
  it("finds what a visitor needs on a well-made home page", () => {
    const facts = analyzePage(CAFE, "https://testgrand.example/");
    expect(facts).toMatchObject({
      https: true,
      title: "Kafé Testgränd (TEST)",
      heading: "Soppa, bröd & kaffe vid torget",
      hasDescription: true,
      mobileLayout: true,
      language: "sv",
      phone: true,
      email: true,
      address: true,
      hours: true,
      prices: true,
      form: true,
      stockPhrases: [],
      images: 2,
      imagesWithoutText: 0,
    });
  });

  it("notices what a weak page lacks, and its stock phrases", () => {
    const facts = analyzePage(COMPETITOR, "http://kahvila.example/");
    expect(facts).toMatchObject({ https: false, hasDescription: false, mobileLayout: false, phone: false, email: false, address: false, hours: false, prices: false, form: false, imagesWithoutText: 1 });
    expect(facts.stockPhrases).toEqual(["brinner för", "skräddarsydda lösningar"]);
  });

  it("reads only the text a visitor sees", () => {
    expect(visibleText("<p>Hej</p><script>secret()</script><!-- note --><style>p{}</style><p>då</p>")).toBe("Hej då");
  });

  it("finds Finnish opening hours", () => {
    expect(analyzePage("<p>Avoinna ma–pe 7.30–17.00</p>", "https://x.example/").hours).toBe(true);
    expect(analyzePage("<p>Vi grundades 1998 och har 12 anställda.</p>", "https://x.example/").hours).toBe(false);
  });
});

const site = (kind: MeasuredSite["kind"], html: string, url: string, performance: number | null = null): MeasuredSite => ({
  kind,
  url,
  page: analyzePage(html, url),
  error: null,
  speed: performance === null ? null : { performance, accessibility: 95, seo: 90, lcpSeconds: 2 },
  speedNote: null,
});

describe("comparing", () => {
  it("says where the client is ahead and what to fix where a competitor is better", () => {
    const ours = site("ours", COMPETITOR.replace("<h1>Välkommen</h1>", "<h1>Soppa och bröd vid torget i Ekenäs</h1>"), "https://ours.example/", 95);
    const better = site("competitor", CAFE, "https://www.bettercafe.example/", 40);
    const comparison = compareSites(ours, [better, site("competitor", COMPETITOR, "http://kahvila.example/", 60)]);
    const standing = Object.fromEntries(comparison.rows.map((r) => [r.key, r.standing]));
    expect(standing).toMatchObject({ phone: "behind", hours: "behind", heading: "ahead", speed: "ahead", a11y: "level", lcp: "level" });
    expect(comparison.fixes.find((f) => f.key === "phone")).toEqual({ key: "phone", text: expect.stringContaining("phone number"), by: ["bettercafe.example"] });
    // Ahead on the heading, https and speed.
    expect(comparison.ahead).toBe(3);
    expect(comparison.behind).toBe(comparison.fixes.length);
  });

  it("leaves a criterion unknown when it could not be measured", () => {
    const ours = site("ours", CAFE, "https://ours.example/");
    const broken: MeasuredSite = { kind: "competitor", url: "https://down.example/", page: null, error: "The page did not answer.", speed: null, speedNote: null };
    const comparison = compareSites(ours, [broken]);
    expect(comparison.rows.every((r) => r.standing === "unknown")).toBe(true);
  });
});
