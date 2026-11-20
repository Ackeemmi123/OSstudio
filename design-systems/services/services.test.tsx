import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITES } from "../../proof/sites";
import { STRESS_SITES } from "../../proof/sites/stress";
import { siteContent, visibleStrings, type Site } from "./content";
import { build } from "./index";
import { foundingYear } from "./formal";
import { CHROME, displayTier } from "./pages";
import { posterLines, stepWords } from "./statement";

const all: [string, Site][] = [...Object.entries(SITES).map(([name, { site }]) => [name, site] as [string, Site]), ...Object.entries(STRESS_SITES)];
const lindqvist = SITES.lindqvist.site;

const words = (text: string) => text.toLowerCase().match(/\p{L}[\p{L}\p{M}'’-]*/gu) ?? [];
const htmlOf = (site: Site) => build(site).filter((file) => file.path.endsWith(".html"));
const visibleText = (html: string) =>
  html
    .slice(html.indexOf("<body"))
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

describe("the content contract", () => {
  it("holds no layout, colour or section-type field", () => {
    for (const key of ["layout", "variant", "color", "colour", "section", "sections", "font", "theme", "columns"]) {
      expect(siteContent.safeParse({ ...lindqvist.content, [key]: "anything" }).success, key).toBe(false);
      const promise = { ...lindqvist.content.promise, [key]: "anything" };
      expect(siteContent.safeParse({ ...lindqvist.content, promise }).success, key).toBe(false);
    }
    const shape = JSON.stringify(Object.keys(siteContent.shape));
    expect(shape).not.toMatch(/layout|variant|colou?r|font|style/i);
  });

  it("takes only businesses marked as invented", () => {
    expect(siteContent.safeParse({ ...lindqvist.content, invented: false }).success).toBe(false);
    const withoutMark: Record<string, unknown> = { ...lindqvist.content };
    delete withoutMark.invented;
    expect(siteContent.safeParse(withoutMark).success).toBe(false);
  });

  it("takes a concept for a real firm only when it is marked as one, and never both", () => {
    const concept = { ...lindqvist.content, invented: undefined, concept: { preparedBy: "Axivo", sources: ["https://example.fi"] } };
    expect(siteContent.safeParse(concept).success).toBe(true);
    expect(siteContent.safeParse({ ...concept, invented: true }).success).toBe(false);
    const home = htmlOf({ ...lindqvist, content: concept })[0].text;
    expect(home).toContain(CHROME.en.conceptNote);
    expect(home).not.toContain(CHROME.en.testNote);
    expect(home).toContain('content="noindex,nofollow"');
  });

  it("lets a client's approved site be found, with nothing left from a test", () => {
    const content = structuredClone(lindqvist.content) as Site["content"];
    delete content.invented;
    content.client = { approvedBy: "A Client", approvedOn: "2026-12-01" };
    expect(() => build({ ...lindqvist, content })).toThrow(/stock photo/);
    content.assets = [];
    delete content.promise.imageId;
    delete content.proof.imageId;
    delete content.about.imageId;
    content.about.people.forEach((person) => delete person.imageId);
    expect(() => build({ ...lindqvist, content })).toThrow(/No permission/);
    content.proof.quotes = [];
    expect(() => build({ ...lindqvist, content })).toThrow(/No consent/);
    content.about.people = [];
    const home = htmlOf({ ...lindqvist, content })[0].text;
    expect(home).not.toContain("noindex");
    expect(home).not.toContain(CHROME.en.testNote);
    expect(home).not.toContain(CHROME.en.conceptNote);
    expect(siteContent.safeParse({ ...content, invented: true }).success).toBe(false);
  });

  it("gives every sentence an origin", () => {
    const missing = { ...lindqvist.content, closing: { ...lindqvist.content.closing, text: { text: "Words." } } };
    expect(siteContent.safeParse(missing).success).toBe(false);
  });

  it("refuses a picture or a headline's turn that does not exist", () => {
    const content = structuredClone(lindqvist.content);
    content.promise.imageId = "nobody";
    expect(() => build({ ...lindqvist, content })).toThrow(/nobody/);
    const turned = structuredClone(lindqvist.content);
    turned.promise.turn = "not how it ends";
    expect(() => build({ ...lindqvist, content: turned })).toThrow(/not how it ends/);
  });
});

describe("what the design system adds", () => {
  for (const [name, site] of all) {
    it(`${name}: adds no words of its own beyond its interface`, () => {
      const allowed = new Set([...visibleStrings(site.content), ...Object.values(CHROME[site.content.language])].flatMap(words));
      for (const file of htmlOf(site)) {
        const extra = words(visibleText(file.text)).filter((word) => !allowed.has(word));
        expect(extra, file.path).toEqual([]);
      }
    });
  }

  it("draws no empty slot when there is no proof", () => {
    const site = STRESS_SITES["no-proof-formal"];
    const home = htmlOf(site).find((file) => file.path === "index.html")!.text;
    expect(home).not.toContain('class="proof');
  });

  it("never needs a photo", () => {
    const home = htmlOf(STRESS_SITES["no-photo-editorial"]).find((file) => file.path === "index.html")!.text;
    expect(home).not.toContain("<img");
    expect(home).toContain("hero--type");
  });

  it("composes one service differently from several", () => {
    const home = htmlOf(STRESS_SITES["one-service-statement"]).find((file) => file.path === "index.html")!.text;
    expect(home).toContain("services--one");
  });

  it("keeps a call button available only for a firm whose main action is a phone call", () => {
    const pages = (site: Site) => htmlOf(site).map((file) => file.text);
    for (const page of pages(SITES.norrsken.site)) expect(page).toContain('class="call-bar"');
    for (const page of pages(lindqvist)) expect(page).not.toContain("call-bar");
  });

  it("uses a founding year only when the firm's own words give one", () => {
    expect(foundingYear("Asianajotoimisto Kivelä on palvellut perheyrityksiä vuodesta 1998.")).toBe("1998");
    expect(foundingYear("A small firm in Helsinki.")).toBeNull();
    const home = (site: Site) => htmlOf(site).find((file) => file.path === "index.html")!.text;
    expect(home(SITES.kivela.site)).toContain("memory-year");
    expect(home(STRESS_SITES["no-proof-formal"])).not.toContain('class="proof');
  });

  it("does not need a founder's photo for the editorial letter", () => {
    const home = htmlOf(STRESS_SITES["no-photo-editorial"]).find((file) => file.path === "index.html")!.text;
    expect(home).toContain("letter--words");
    expect(htmlOf(lindqvist)[0].text).toContain('class="cameo"');
  });

  it("sets a headline as poster lines only when it reads well that way", () => {
    expect(posterLines("Läcker det? Vi är hos dig inom två timmar.", "inom två timmar.")).toEqual(["Läcker det?", "Vi är hos dig", "inom två timmar."]);
    expect(posterLines("Lämpöpumppuasennuspalvelut taloyhtiöille")).toBeNull();
    expect(posterLines("A short one. A headline with a line that runs on for far too long. Done.")).toBeNull();
  });

  it("gives each step its own word only when the heading has one for each", () => {
    expect(stepWords("Ring. Vi kommer. Klart.", 3)).toEqual(["Ring.", "Vi kommer.", "Klart."]);
    expect(stepWords("Ring. Vi kommer. Klart.", 2)).toBeNull();
    expect(stepWords("Kolme askelta ennen kuin mitään on päätetty.", 3)).toBeNull();
  });

  it("draws a motif only for the site that chose it", () => {
    const home = (site: Site) => htmlOf(site).find((file) => file.path === "index.html")!.text;
    expect(home(SITES.norrsken.site)).toContain('class="pipe ');
    expect(home(SITES.norrsken.site)).toContain("m-pipe");
    const noMotif = { ...SITES.norrsken.site, design: { system: SITES.norrsken.site.design.system, direction: SITES.norrsken.site.design.direction, palette: SITES.norrsken.site.design.palette } };
    expect(home(noMotif)).not.toContain('class="pipe ');
    expect(home(noMotif)).not.toContain("m-pipe");
  });

  it("gives a long headline or a long word a smaller display size", () => {
    expect(displayTier("Short and clear.")).toBe(1);
    expect(displayTier("A headline that runs on for rather longer than most")).toBe(1);
    expect(displayTier("Omistajanvaihdostilanteet")).toBe(3);
    expect(displayTier("A headline of a length that really needs a good deal more room to be read well on a phone screen")).toBe(3);
  });
});

describe("the built site", () => {
  it("has all its pages, with a way back from each", () => {
    const paths = build(lindqvist).map((file) => file.path);
    expect(paths).toEqual(["site.css", "index.html", "about/index.html", "contact/index.html", "privacy/index.html", "sent/index.html", "not-sent/index.html", "404.html", "robots.txt"]);
  });

  it("as a client's prototype: names the agency, switches the form off and stays out of search engines", () => {
    const { invented: _invented, ...rest } = lindqvist.content;
    void _invented;
    const files = build({ ...lindqvist, content: { ...rest, prototype: { madeBy: "Byrå & Co" } } });
    const home = files.find((file) => file.path === "index.html")!.text;
    expect(home).toContain(CHROME[lindqvist.content.language].prototypeNote.replace("{madeBy}", "Byrå &amp; Co"));
    expect(home).toMatch(/type="submit" disabled=""/);
    expect(home).toContain('content="noindex,nofollow"');
    expect(files.some((file) => file.path === "robots.txt")).toBe(true);
  });

  it("posts the forms to the given address only", () => {
    const { invented: _invented, ...rest } = lindqvist.content;
    void _invented;
    const site = { ...lindqvist, content: { ...rest, prototype: { madeBy: "Axivo" } }, formAction: "https://studio.example/api/site-forms/abc" };
    const contact = build(site).find((file) => file.path === `${rest.contact.slug}/index.html`)!.text;
    expect(contact).toContain('action="https://studio.example/api/site-forms/abc"');
    expect(contact).toContain('name="form" value="contact"');
    expect(build({ ...site, formAction: 'javascript:x"' }).find((file) => file.path === "index.html")!.text).toContain('action="/api/contact"');
  });

  it("runs no scripts, stays out of search engines, and says it is a test", () => {
    for (const [, site] of all) {
      for (const file of htmlOf(site)) {
        expect(file.text).not.toMatch(/<script/i);
        expect(file.text).toContain('content="noindex,nofollow"');
        expect(file.text).toContain(CHROME[site.content.language].testNote);
        expect(file.text).toContain(`lang="${site.content.language}"`);
      }
    }
  });

  it("loads fonts from its own files, and nothing but stock photos from anywhere else", () => {
    for (const [, site] of all) {
      for (const file of htmlOf(site)) {
        const outside = (file.text.match(/(?:src|href)="https?:[^"]*"/g) ?? []).filter((found) => !found.includes("images.unsplash.com"));
        expect(outside).toEqual([]);
      }
    }
    const css = build(lindqvist).find((file) => file.path === "site.css")!.text;
    // An inline drawing has to name its format with this address. Nothing is fetched from it.
    expect(css.replaceAll("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:/);
    const fonts = readdirSync(path.join(__dirname, "fonts"));
    for (const font of css.match(/fonts\/[^)]+/g) ?? []) expect(fonts).toContain(font.replace("fonts/", ""));
    expect(readFileSync(path.join(__dirname, "fonts/LICENSE-fraunces.txt"), "utf8")).toMatch(/Open Font License/);
  });

  it("three firms get three different looks and compositions", () => {
    const bodies = Object.values(SITES).map(({ site }) => /<body class="([^"]+)"/.exec(htmlOf(site)[0].text)![1]);
    expect(new Set(bodies).size).toBe(3);
  });
});
