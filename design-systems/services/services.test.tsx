import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SITES } from "../../proof/sites";
import { STRESS_SITES } from "../../proof/sites/stress";
import { siteContent, visibleStrings, type Site } from "./content";
import { build } from "./index";
import { foundingYear } from "./formal";
import { CHROME, displayTier, widerSizes } from "./pages";
import { posterLines, stepWords } from "./statement";
import { STYLES } from "./styles";

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

describe("the concept", () => {
  const w = (text: string, origin: "person" | "client_confirmed" = "person") => ({ text, origin });

  it("draws the chosen signature part, and refuses one the content does not have", () => {
    const site = STRESS_SITES["concept-editorial-year-full"];
    const home = htmlOf(site)[0].text;
    expect(home).toContain('class="sig sig--year"');
    expect(home).toContain("hero--full");
    expect(home).toContain("f-warm");
    expect(home).toContain("mo-lively");
    expect(() => build({ ...site, design: { ...site.design, signature: "area" } })).toThrow(/signature part area/);
  });

  it("leaves the photo out of the hero when the concept is type", () => {
    const home = htmlOf({ ...lindqvist, design: { ...lindqvist.design, hero: "type" } })[0].text;
    expect(home).toContain("hero hero--type");
    expect(home.slice(0, home.indexOf("</section>"))).not.toContain("<img");
  });

  it("never sets a heading's end in italics or another colour", () => {
    for (const [name, site] of all) {
      for (const file of htmlOf(site)) expect(file.text, `${name} ${file.path}`).not.toMatch(/<h[12][^>]*>[^<]*<em/);
    }
  });

  it("on a client's site, needs consent for the owner's line and confirmed numbers", () => {
    const content = structuredClone(lindqvist.content) as Site["content"];
    delete content.invented;
    content.client = { approvedBy: "A Client", approvedOn: "2026-12-01" };
    content.assets = [];
    delete content.promise.imageId;
    delete content.proof.imageId;
    delete content.about.imageId;
    content.about.people = [];
    content.proof.quotes = [];
    content.signature = { ownerLine: { text: w("We answer the same day."), who: "Anna", consent: "invented_test_data" } };
    expect(() => build({ ...lindqvist, content })).toThrow(/No consent to quote Anna/);
    content.signature = { numbers: { label: "In numbers", items: [{ value: "100", text: w("companies") }, { value: "1", text: w("office", "client_confirmed") }] } };
    expect(() => build({ ...lindqvist, content })).toThrow(/100 is not confirmed/);
    content.signature.numbers!.items[0].text.origin = "client_confirmed";
    expect(() => build({ ...lindqvist, content, design: { ...lindqvist.design, signature: "numbers" } })).not.toThrow();
  });
});

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

describe("the café and atelier directions", () => {
  const home = (site: Site) => htmlOf(site).find((file) => file.path === "index.html")!.text;

  it("café: opening hours first, the menu as a card, and the priced item pinned as a note", () => {
    const page = home(STRESS_SITES["cafe-priced-note"]);
    expect(page).toContain('class="visit-bar"');
    expect(page).toContain(CHROME.en.hours);
    expect(page).toContain('class="menu-lines"');
    expect(page).toMatch(/class="pinned"[\s\S]*12 €/);
  });

  it("café: draws no note, hours or address that the content does not have", () => {
    const page = home(STRESS_SITES["cafe-no-photo-no-hours"]);
    expect(page).not.toContain("visit-bar");
    expect(page).not.toContain("pinned");
    expect(page).not.toContain("visit-card");
    expect(page).not.toContain("<img");
    expect(page).not.toContain("menu-price");
  });

  it("atelier: leads with the gallery, and puts the services there when it has none", () => {
    const withGallery = home(STRESS_SITES["atelier-gallery"]);
    expect(withGallery).toContain('class="work-grid"');
    expect(withGallery.indexOf("work-grid")).toBeLessThan(withGallery.indexOf('class="ledger"'));
    const without = home(STRESS_SITES["atelier-no-gallery"]);
    expect(without).not.toContain("work-grid");
    expect(without).toContain('class="ledger"');
  });

  it("refuses a gallery picture that does not exist", () => {
    const site = structuredClone(STRESS_SITES["atelier-gallery"]);
    site.content.gallery!.items[0].imageId = "nowhere";
    expect(() => build(site)).toThrow(/nowhere/);
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
    // The mail to the client is written in the site's language.
    expect(contact).toContain(`<input type="hidden" name="lang" value="${rest.language}"/>`);
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

  it("never leaves text half-faded: what fades in with the scroll starts hidden, and nothing is faded at the top of the page", () => {
    const keyframes = new Map([...STYLES.matchAll(/@keyframes ([\w-]+)\{((?:[^{}]*\{[^{}]*\})+)\}/g)].map((found) => [found[1], found[2]]));
    const scrolled = [...STYLES.matchAll(/([^{}]+)\{animation:([\w-]+) linear both([^;}]*);animation-timeline:view\(\)([^;}]*)/g)].map(([, selector, name, more, timelines]) => ({ selector: selector.trim(), name, more, timelines }));
    expect(scrolled.length).toBeGreaterThan(20);
    // An ornament drawn as a pseudo-element carries no text and may stay faint.
    const fading = scrolled.filter(({ selector, name }) => keyframes.get(name)!.includes("opacity") && !selector.split(",").every((one) => /::(before|after)$/.test(one)));
    expect(fading.map(({ name }) => name).sort()).toEqual(["atelier-arrive", "atelier-reveal", "cafe-rise", "editorial-rise", "formal-lift", "formal-step", "sig-count", "sig-rise"]);
    for (const { name, more, timelines } of fading) {
      expect(keyframes.get(name), name).toMatch(/^from\{[^}]*opacity:0[;}]/);
      expect(keyframes.get(name), name).toMatch(/^from\{[^}]*\}\d+%\{opacity:1\}/);
      expect(more, name).toBe(",at-rest linear backwards");
      expect(timelines, name).toBe(",scroll(root)");
    }
    expect(keyframes.get("at-rest")).toBe("from{opacity:1}");
    // Every range that belongs to such an entrance also names the range of at-rest, or at-rest would follow the entrance's.
    for (const [, range] of STYLES.matchAll(/animation-range:(entry [^;}]*cover [^;}]*)/g)) if (range.includes(",")) expect(range).toMatch(/,0 20vh$/);
    expect(STYLES.match(/,0 20vh\}/g)).toHaveLength(11);
  });
});

describe("a built site's own pictures", () => {
  // The sample firm with its pictures as a build stores them: files in the site's folder.
  const own = (variants: boolean, width = 1600, height = 1000): Site => ({
    ...lindqvist,
    content: {
      ...lindqvist.content,
      assets: lindqvist.content.assets.map((asset) => ({
        ...asset,
        src: `/img/${asset.id}-1600.webp`,
        width,
        height,
        ...(variants ? { variants: [320, 640, 960, 1600].map((step) => ({ src: `/img/${asset.id}-${step}.webp`, width: step })) } : {}),
      })),
    },
  });
  const imgs = (site: Site) => htmlOf(site).flatMap((file) => file.text.match(/<img\b[^>]*>/g) ?? []);
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

  it("offers each picture at the widths the build made, and changes nothing else about it", () => {
    const made = imgs(own(true));
    const plain = imgs(own(false));
    expect(made.length).toBeGreaterThan(2);
    expect(made).toHaveLength(plain.length);
    for (const [i, tag] of made.entries()) {
      const id = attr(tag, "src")!.match(/^\/img\/(.+)-1600\.webp$/)![1];
      expect(attr(tag, "srcset")).toBe([320, 640, 960, 1600].map((step) => `/img/${id}-${step}.webp ${step}w`).join(", "));
      expect(attr(plain[i], "srcset")).toBeUndefined();
      for (const name of ["src", "alt", "width", "height", "loading", "decoding", "fetchpriority", "class", "referrerpolicy"]) expect(attr(tag, name), name).toBe(attr(plain[i], name));
      expect(attr(tag, "sizes")).toBeTruthy();
    }
    const strip = (site: Site) => htmlOf(site).map((file) => file.text.replace(/<img\b[^>]*>/g, "<img>"));
    expect(strip(own(true))).toEqual(strip(own(false)));
  });

  it("asks for a wider file when the picture is wider in shape than its frame, since it is cropped to fill it", () => {
    // A 3:2 photo in the 4:5 portrait frames of the people page is drawn 1.88 times as wide as the frame.
    const wide = imgs(own(true, 1500, 1000)).map((tag) => attr(tag, "sizes")!);
    expect(wide.some((sizes) => / \* 1\.88\)/.test(sizes))).toBe(true);
    // A picture taller in shape than every frame keeps the frames' own widths.
    const tall = imgs(own(true, 600, 1000)).map((tag) => attr(tag, "sizes")!);
    expect(tall).toEqual(imgs(own(false, 600, 1000)).map((tag) => attr(tag, "sizes")!));
  });

  it("gives a portrait of the site's own an upright place where the design's place is wide, so no head is cut off", () => {
    const about = (site: Site) => htmlOf(site).find((file) => file.path.startsWith(`${site.content.about.slug}/`))!.text;
    // A landscape picture, and any stock picture, keeps the band across the page.
    expect(about(own(true))).toContain('<figure class="wide-image">');
    expect(about(lindqvist)).toContain('<figure class="wide-image">');
    const tall = about(own(true, 720, 1082));
    expect(tall).toContain('<div class="portrait-story"><figure class="wide-image wide-image--tall">');
    expect(tall).not.toContain('<figure class="wide-image">');
    expect(attr(tall.match(/<figure class="wide-image wide-image--tall"><img\b[^>]*>/)![0], "height")).toBe("1500");
    expect(STYLES).toContain(".wide-image.wide-image--tall img{aspect-ratio:4/5;object-position:50% 12%}");
    // The story stands beside the portrait, so no half of the page is left empty; on a phone it follows below.
    expect(tall).toMatch(/<\/figure><section class="story story--beside" aria-label="[^"]*"><p>/);
    expect(STYLES).toContain(".portrait-story .story.story--beside{grid-column:7/13;");
    expect(STYLES).toMatch(/@media[^{]*\{[^@]*\.portrait-story \.wide-image--tall,\.portrait-story \.story\.story--beside\{grid-column:1\/-1\}/);
    // Every paragraph of the story is still there, once.
    const site = own(true, 720, 1082);
    for (const paragraph of site.content.about.story) expect(tall.split(`<p>${paragraph.text}</p>`).length).toBe(2);
    // The formal home page's picture beside the firm's story: upright too, and still, since drifting hides its top.
    const home = (site: Site) => htmlOf({ ...site, design: { ...site.design, direction: "formal" } }).find((file) => file.path === "index.html")!.text;
    expect(home(own(true))).toContain('<figure class="memory-image">');
    expect(home(own(true, 720, 1082))).toContain('<figure class="memory-image memory-image--tall">');
    expect(STYLES).toContain(".memory-image.memory-image--tall img{height:100%;object-position:50% 12%;animation:none}");
  });

  it("multiplies every width in a sizes list, whatever its condition", () => {
    expect(widerSizes("100vw", 1)).toBe("100vw");
    expect(widerSizes("100vw", 1.5)).toBe("calc(100vw * 1.5)");
    expect(widerSizes("(max-width: 820px) 90vw, 44vw", 1.875)).toBe("(max-width: 820px) calc(90vw * 1.88), calc(44vw * 1.88)");
    expect(widerSizes("(max-width: 820px) calc(100vw - 40px), min(650px, 45vw)", 2)).toBe("(max-width: 820px) calc(calc(100vw - 40px) * 2), calc(min(650px, 45vw) * 2)");
    // One number for each entry: a place that is 4:3 on a phone and 2:1 on a wide screen.
    expect(widerSizes("(max-width: 820px) 100vw, 100vw", [1.5 / (4 / 3), 1.5 / 2])).toBe("(max-width: 820px) calc(100vw * 1.13), 100vw");
  });
});
