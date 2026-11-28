import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PNG } from "pngjs";
import { ASSOCIATION_PRESET, DIRECTION_PRESETS, MAPS, enhanceSite, presetForDirection } from "../layer/enhance.mjs";

/**
 * The Signature layer on a small site built by hand (tests/fixtures/layer-site,
 * with pictures made in code), enhanced through its own map of selectors:
 * `/layer-fixture/base/` is the site as written, `/layer-fixture/enhanced/`
 * the same with the layer and the editorial preset (every module allowed),
 * `/layer-fixture/calm/` the same map with the calm preset.
 *
 * Without JavaScript and with reduced motion the enhanced site must be the
 * base site, pixel for pixel. With motion, every module the map names must
 * be attached and must move, nothing may shift, focus may never be hidden,
 * and axe must stay clean. Motion is judged on frames recorded in the page,
 * from before its first paint, never on one sample after a fixed wait.
 */

const BASE = "/layer-fixture/base/";
const ENHANCED = "/layer-fixture/enhanced/";
const CALM = "/layer-fixture/calm/";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Scrolls the way a hand does, in small steps, so observers see every stage. */
async function scrollTo(page: Page, target: number, step = 60) {
  let at = await page.evaluate(() => scrollY);
  const direction = Math.sign(target - at);
  while (Math.abs(target - at) > 1) {
    at = direction > 0 ? Math.min(target, at + step) : Math.max(target, at - step);
    await page.evaluate((y) => window.scrollTo(0, y), at);
    await page.waitForTimeout(16);
  }
}

/** How many pixels of two screenshots differ (every one, if their sizes do). Pixels, not bytes: the same picture can be packed in more than one way. */
function differing(one: Buffer, other: Buffer): number {
  const a = PNG.sync.read(one);
  const b = PNG.sync.read(other);
  if (a.width !== b.width || a.height !== b.height) return Math.max(a.width * a.height, b.width * b.height);
  let count = 0;
  for (let at = 0; at < a.data.length; at += 4) if (a.data[at] !== b.data[at] || a.data[at + 1] !== b.data[at + 1] || a.data[at + 2] !== b.data[at + 2] || a.data[at + 3] !== b.data[at + 3]) count++;
  return count;
}

/**
 * Two whole-page screenshots of the very same page are not always the same to the last pixel: a browser that draws on
 * the graphics card scales pictures a hair differently from one run to the next (measured here: the base site against
 * itself, 33 of 6.5 million pixels on desktop, 2,400 of 12.9 million on the phone). So screenshots are held to 0.05 %,
 * and `drawn` below is what must match exactly.
 */
const NOISE = 0.0005;

/**
 * What a page is drawn from: its body as markup, and for every element its box and every computed style property.
 * Two pages where all of this is equal draw the same pixels.
 */
const drawn = (page: Page) =>
  page.evaluate(() => {
    const hash = (text: string) => {
      let value = 5381;
      for (let at = 0; at < text.length; at++) value = ((value << 5) + value + text.charCodeAt(at)) | 0;
      return value;
    };
    const elements = [document.documentElement, ...document.querySelectorAll<HTMLElement>("body, body *")];
    return {
      markup: hash(document.body.outerHTML),
      root: document.documentElement.className + "|" + document.documentElement.getAttribute("style"),
      elements: elements.map((element) => {
        const style = getComputedStyle(element);
        const box = element.getBoundingClientRect();
        return `${element.tagName}.${element.className} ${box.left},${box.top + scrollY} ${box.width}x${box.height} ${hash([...style].map((name) => style.getPropertyValue(name)).join("|"))}`;
      }),
    };
  });

/** Every picture of the page fetched and decoded, so a screenshot of the whole page is the whole page. */
const pictures = (page: Page) => page.evaluate(() => Promise.all([...document.images].map((image) => ((image.loading = "eager"), image.decode().catch(() => undefined)))));

const pageHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const topOf = (page: Page, selector: string) => page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().top + scrollY, selector);

/** Every arrival that has started has ended, and none is under way. */
const settled = (page: Page) => expect.poll(() => page.evaluate(() => document.querySelectorAll('[data-sgl-s="in"]').length), { timeout: 15_000 }).toBe(0);

type Frame = {
  /** The watched element's state: "" before the layer has it, then wait, in, done. */
  state: string;
  /** How many word boxes the watched headline has. */
  words: number;
  /** How far below its place the first word is drawn, in pixels, and how see-through it is. */
  wordY: number;
  wordOpacity: number;
  /** The watched picture frame's clip. */
  clip: string;
  /** Whether anything is wider than the screen. */
  wide: boolean;
};

/** Records on every frame the page draws, from before its first paint: a headline and a picture frame. */
async function record(page: Page, headline: string, picture: string) {
  await page.addInitScript(
    ([h, p]) => {
      const frames: Frame[] = [];
      (window as unknown as { sgFrames: Frame[] }).sgFrames = frames;
      const sample = () => {
        const title = document.querySelector<HTMLElement>(h);
        const frame = document.querySelector<HTMLElement>(p);
        if (title && frame) {
          const word = title.querySelector(".sgl-i");
          const style = word ? getComputedStyle(word) : null;
          frames.push({
            state: title.dataset.sglS ?? "",
            words: title.querySelectorAll(".sgl-i").length,
            wordY: style && style.transform !== "none" ? new DOMMatrix(style.transform).m42 : 0,
            wordOpacity: style ? Number(style.opacity) : 1,
            clip: getComputedStyle(frame).clipPath,
            wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          });
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    [headline, picture],
  );
}
const frames = (page: Page) => page.evaluate(() => (window as unknown as { sgFrames: Frame[] }).sgFrames);
/** How much of the frame a clip like `inset(0px 0px 62.5%)` still hides at its foot, in per cent; 0 for none. */
const hidden = (clip: string) => (clip === "none" ? 0 : Number.parseFloat(clip.replace("inset(", "").split(" ")[2] ?? "0"));

test.describe("Signature layer", () => {
  // Several pages and whole-page screenshots in one test: room for a busy machine.
  test.describe.configure({ timeout: 90_000 });

  test("without JavaScript the enhanced site is the base site, pixel for pixel", async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, javaScriptEnabled: false });
    const shots: Buffer[] = [];
    const made: Awaited<ReturnType<typeof drawn>>[] = [];
    for (const path of [BASE, ENHANCED, `${BASE}om/`, `${ENHANCED}om/`]) {
      const page = await context.newPage();
      await page.goto(path);
      await pictures(page);
      if (path.includes("enhanced")) {
        // The layer is there to be loaded, and has done nothing.
        await expect(page.locator('head script[type="module"][src$="signature/site.js"]')).toHaveCount(1);
        await expect(page.locator("html")).not.toHaveClass(/sgl/);
        expect(await page.locator("[data-sgl], [data-sg], .sgl-w").count()).toBe(0);
      }
      made.push(await drawn(page));
      shots.push(await page.screenshot({ fullPage: true, animations: "disabled" }));
      await page.close();
    }
    // The same markup, the same boxes, the same computed styles on every element: exactly.
    expect(made[1]).toEqual(made[0]);
    expect(made[3]).toEqual(made[2]);
    // And the same picture, to the browser's own noise.
    const pixels = (shot: Buffer) => PNG.sync.read(shot).width * PNG.sync.read(shot).height;
    expect(differing(shots[1], shots[0]) / pixels(shots[0]), "share of pixels that differ on the first page").toBeLessThan(NOISE);
    expect(differing(shots[3], shots[2]) / pixels(shots[2]), "share of pixels that differ on the page in a folder").toBeLessThan(NOISE);
    await context.close();
  });

  test("with reduced motion nothing of the layer exists, nothing moves and nothing is hidden", async ({ browser }, info) => {
    const context = await browser.newContext({ ...info.project.use, reducedMotion: "reduce" });
    const base = await context.newPage();
    await base.goto(BASE);
    const page = await context.newPage();
    const errors = collectErrors(page);
    // Counts, on every frame, what is animating and what the layer has touched.
    await page.addInitScript(() => {
      const seen = { animations: 0, touched: 0 };
      (window as unknown as { sgSeen: typeof seen }).sgSeen = seen;
      const sample = () => {
        seen.animations = Math.max(seen.animations, document.getAnimations().length);
        seen.touched = Math.max(seen.touched, document.querySelectorAll("[data-sgl], [data-sg], .sgl-w, .sgl-n, .sgl-cta").length);
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto(ENHANCED);
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 300);
    await scrollTo(page, await pageHeight(page));
    await scrollTo(page, 0);
    await expect(page.locator("html")).not.toHaveClass(/sgl/);
    expect(await page.evaluate(() => (window as unknown as { sgSeen: { animations: number; touched: number } }).sgSeen)).toEqual({ animations: 0, touched: 0 });
    expect(await page.evaluate(() => document.documentElement.dataset.sgSmooth)).toBeUndefined();
    for (const view of [base, page]) await pictures(view);
    expect(await drawn(page)).toEqual(await drawn(base));
    const shot = await base.screenshot({ fullPage: true });
    expect(differing(await page.screenshot({ fullPage: true }), shot) / (PNG.sync.read(shot).width * PNG.sync.read(shot).height), "share of pixels that differ from the base site").toBeLessThan(NOISE);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations).toEqual([]);
    expect(errors).toEqual([]);
    await context.close();
  });

  test("the first view arrives from the first paint: headline by lines out of masks, picture unveiled, then the page as written", async ({ page }) => {
    const errors = collectErrors(page);
    await record(page, ".lead-title", ".lead-picture");
    await page.goto(ENHANCED);
    await expect(page.locator("html")).toHaveClass(/sgl/);
    await expect(page.locator("html")).toHaveAttribute("data-sgl-preset", "editorial");
    await expect(page.locator(".lead-title")).toHaveAttribute("data-sgl-s", "done", { timeout: 15_000 });
    // On a phone the picture is below the first screen: it waits there, and opens when it is scrolled to.
    await scrollTo(page, Math.max(0, (await topOf(page, ".lead-picture")) - 300));
    await expect(page.locator(".lead-picture")).toHaveAttribute("data-sgl-s", "done", { timeout: 15_000 });
    const seen = await frames(page);

    // Mapped before anything was drawn: the headline was never shown at rest and then taken away.
    expect(seen[0].state, "state on the first frame").toBe("in");
    expect(seen[0].words).toBeGreaterThan(3);
    // Each word starts below its mask and only ever rises.
    const rising = seen.filter((frame) => frame.state === "in");
    expect(rising[0].wordY).toBeGreaterThan(20);
    for (let at = 1; at < rising.length; at++) expect(rising[at].wordY).toBeLessThanOrEqual(rising[at - 1].wordY + 0.5);
    expect(new Set(rising.map((frame) => Math.round(frame.wordY))).size, "stages of the rise seen").toBeGreaterThan(3);
    // The editorial preset masks, it does not fade.
    expect(Math.min(...rising.map((frame) => frame.wordOpacity))).toBe(1);

    // The picture's frame opens from the top down and ends unclipped.
    const clips = seen.map((frame) => hidden(frame.clip));
    expect(clips[0]).toBeGreaterThan(90);
    for (let at = 1; at < clips.length; at++) expect(clips[at]).toBeLessThanOrEqual(clips[at - 1] + 0.01);
    expect(new Set(clips.map((value) => Math.round(value))).size).toBeGreaterThan(3);
    expect(seen.at(-1)!.clip).toBe("none");

    // When it is over, the headline is the markup that was written: no word boxes left, the emphasis intact.
    expect(seen.at(-1)!.words).toBe(0);
    expect(await page.locator(".lead-title").innerHTML()).toBe("Rum där ljuset och <em>materialen</em> gör arbetet.");
    expect(errors).toEqual([]);
  });

  test("further down, content waits only until it is scrolled to, then arrives once", async ({ page }) => {
    const errors = collectErrors(page);
    await record(page, "#plates", ".plate");
    await page.goto(ENHANCED);
    await expect(page.locator("#plates")).toHaveAttribute("data-sgl-s", "wait");
    await expect(page.locator(".plates-text")).toHaveAttribute("data-sgl", "rise");
    await scrollTo(page, (await topOf(page, "#plates")) - 200);
    await expect(page.locator("#plates")).toHaveAttribute("data-sgl-s", "done", { timeout: 15_000 });
    await expect(page.locator(".plate").first()).toHaveAttribute("data-sgl-s", "done", { timeout: 15_000 });
    const seen = await frames(page);
    const waiting = seen.filter((frame) => frame.state === "wait");
    const rising = seen.filter((frame) => frame.state === "in");
    // Waiting, it is held below its mask; arriving, it only rises; done, it is plain text again.
    expect(waiting.length).toBeGreaterThan(0);
    expect(Math.min(...waiting.map((frame) => frame.wordY))).toBeGreaterThan(20);
    for (let at = 1; at < rising.length; at++) expect(rising[at].wordY).toBeLessThanOrEqual(rising[at - 1].wordY + 0.5);
    expect(new Set(rising.map((frame) => Math.round(frame.wordY))).size).toBeGreaterThan(3);
    expect(seen.at(-1)!.words).toBe(0);
    expect(hidden(waiting[0].clip)).toBe(100);
    expect(seen.at(-1)!.clip).toBe("none");

    // Scrolling away and back does not play it again.
    await scrollTo(page, 0);
    await scrollTo(page, (await topOf(page, "#plates")) - 200);
    await expect(page.locator("#plates")).toHaveAttribute("data-sgl-s", "done");
    expect(await page.locator("#plates .sgl-w").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test("figures count up in a box that never changes width, and end as written", async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript(() => {
      const seen = { texts: [] as string[][], widths: [] as number[][] };
      (window as unknown as { sgCount: typeof seen }).sgCount = seen;
      const sample = () => {
        const numbers = [...document.querySelectorAll<HTMLElement>(".fact-number")];
        if (numbers.length) {
          // What a visitor sees: the hidden text for screen readers left out.
          seen.texts.push(numbers.map((number) => [...number.childNodes].map((node) => (node instanceof HTMLElement && node.classList.contains("sgl-n") ? (node.lastElementChild?.textContent ?? "") : (node.textContent ?? ""))).join("")));
          // The width of the figure as drawn, digits and unit together: the counting box or the plain text, from the first edge to the last.
          seen.widths.push(
            numbers.map((number) => {
              const range = document.createRange();
              const boxes = [...number.childNodes].flatMap((node) => {
                if (node instanceof HTMLElement) return [node.getBoundingClientRect()];
                if (!node.textContent) return [];
                range.selectNodeContents(node);
                return [range.getBoundingClientRect()];
              });
              return Math.round((Math.max(...boxes.map((box) => box.right)) - Math.min(...boxes.map((box) => box.left))) * 10) / 10;
            }),
          );
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.goto(ENHANCED);
    const natural = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".fact-number")].map((number) => number.scrollWidth));
    await scrollTo(page, (await topOf(page, ".facts")) - 300);
    await expect.poll(() => page.evaluate(() => document.querySelectorAll(".sgl-n").length), { timeout: 15_000 }).toBe(0);
    await expect.poll(() => page.locator(".fact-number").allTextContents(), { timeout: 15_000 }).toEqual(["340", "12 år", "2013", "89,50 €"]);
    const seen = await page.evaluate(() => (window as unknown as { sgCount: { texts: string[][]; widths: number[][] } }).sgCount);
    const values = (column: number) => seen.texts.map((row) => Number.parseInt(row[column], 10));
    for (const [column, to] of [[0, 340], [1, 12], [2, 2013]] as const) {
      const run = values(column);
      // Up only, through several values, to the figure in the page.
      for (let at = 1; at < run.length; at++) expect(run[at]).toBeGreaterThanOrEqual(run[at - 1] === to ? 0 : run[at - 1]);
      expect(new Set(run).size, `values seen in column ${column}`).toBeGreaterThan(4);
      expect(run.at(-1)).toBe(to);
    }
    // A year counts its last decades, never from nothing; the unit stays; a price is left alone.
    expect(Math.min(...values(2))).toBeGreaterThan(1900);
    expect(seen.texts.every((row) => row[1].endsWith(" år"))).toBe(true);
    expect(new Set(seen.texts.map((row) => row[3]))).toEqual(new Set(["89,50 €"]));
    // Nothing around a counting figure moves: every column keeps its width on every frame.
    for (const row of seen.widths) expect(row).toEqual(seen.widths[0]);
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".fact-number")].map((number) => number.scrollWidth))).toEqual(natural);
    expect(errors).toEqual([]);
  });

  test("steps stack, the hover list follows a mouse, and the call to action floats: each attached through the map", async ({ page }) => {
    const errors = collectErrors(page);
    const base = await page.context().newPage();
    await base.goto(BASE);
    const place = (view: Page) => view.evaluate(() => JSON.stringify(document.querySelector(".lead-actions .action")!.getBoundingClientRect()));
    await page.goto(ENHANCED);

    // The call to action: the page's own link in a wrapper that moved nothing.
    await expect(page.locator(".sgl-cta[data-sg='cta'] > a.action")).toHaveCount(1);
    await expect(page.locator(".lead-actions")).toHaveAttribute("data-sgl-s", "done", { timeout: 15_000 });
    expect(await place(page)).toBe(await place(base));
    await expect(page.locator(".close")).toHaveAttribute("data-sg-cta-end", "");
    await expect(page.locator(".sgl-cta")).toHaveClass(/is-ready/, { timeout: 15_000 });

    // The stack: the engine's own, on the site's list.
    await expect(page.locator(".step-list")).toHaveAttribute("data-sg", "stack");
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".step")].map((card) => [getComputedStyle(card).position, card.style.getPropertyValue("--i")]))).toEqual([["sticky", "0"], ["sticky", "1"], ["sticky", "2"]]);
    const stack = await topOf(page, ".step-list");
    await scrollTo(page, stack + 260);
    const tops = await page.evaluate(() => [...document.querySelectorAll(".step")].map((card) => Math.round(card.getBoundingClientRect().top)));
    // The second card has come up over the first, which stays near the top.
    expect(tops[1] - tops[0]).toBeLessThan(200);
    expect(tops[0]).toBeGreaterThan(0);

    // Past the first screen and reading up, the same link floats at the foot of the screen.
    await scrollTo(page, stack - 500);
    await expect(page.locator(".sgl-cta")).toHaveClass(/is-floating/);
    await expect(page.locator(".sgl-cta")).toHaveClass(/is-shown/, { timeout: 10_000 });
    await expect.poll(() => page.evaluate(() => innerHeight - document.querySelector(".sgl-cta a")!.getBoundingClientRect().bottom), { timeout: 10_000 }).toBeLessThan(40);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".sgl-cta a")!).position)).toBe("fixed");

    // The list: a picture under a mouse; every row's own small picture for everyone else.
    const hovers = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches);
    if (hovers) {
      await expect(page.locator(".case-list")).toHaveAttribute("data-sg", "reveal-list");
      await page.locator(".case-list").scrollIntoViewIfNeeded();
      await expect(page.locator(".case-list")).toHaveClass(/is-live/, { timeout: 20_000 });
      expect(await page.locator(".case-thumb").first().evaluate((thumb) => getComputedStyle(thumb).display)).toBe("none");
      const row = await page.locator(".case-list li").nth(1).boundingBox();
      await page.mouse.move(row!.x + 200, row!.y + row!.height / 2);
      await page.mouse.move(row!.x + 260, row!.y + row!.height / 2, { steps: 6 });
      const float = page.locator(".sg-reveal-float");
      await expect.poll(() => float.evaluate((element) => Number(getComputedStyle(element).opacity)), { timeout: 10_000 }).toBe(1);
      await expect(float.locator("img.is-active")).toHaveAttribute("src", /siden-ockra/);
      const box = await float.boundingBox();
      expect(box!.width).toBeGreaterThan(150);
      // It is where the pointer is.
      await expect.poll(async () => Math.abs((await float.boundingBox())!.x + (await float.boundingBox())!.width / 2 - (row!.x + 260)), { timeout: 10_000 }).toBeLessThan(30);
    } else {
      await expect(page.locator(".case-list")).not.toHaveAttribute("data-sg", "reveal-list");
      await expect(page.locator(".case-thumb").first()).toBeVisible();
    }
    expect(errors).toEqual([]);
  });

  test("the preset decides which modules exist: calm has reveals and headline rises only, and moves no box", async ({ page }) => {
    const errors = collectErrors(page);
    const base = await page.context().newPage();
    await base.goto(BASE);
    await record(page, ".lead-title", ".lead-picture");
    await page.goto(CALM);
    await expect(page.locator("html")).toHaveAttribute("data-sgl-preset", "calm");
    await expect(page.locator(".lead-title")).toHaveAttribute("data-sgl-s", "done", { timeout: 15_000 });
    const seen = await frames(page);
    // Calm fades lines up a little; it never masks, and never clips a picture.
    const rising = seen.filter((frame) => frame.state === "in");
    expect(rising[0].wordOpacity).toBeLessThan(0.5);
    expect(Math.max(...rising.map((frame) => frame.wordY))).toBeLessThan(40);
    expect(new Set(seen.map((frame) => frame.clip))).toEqual(new Set(["none"]));

    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 400);
    await scrollTo(page, await pageHeight(page));
    await settled(page);
    // No smooth scrolling, no floating link, no stack, no hover list, no counting.
    expect(await page.evaluate(() => document.documentElement.dataset.sgSmooth)).toBeUndefined();
    expect(await page.locator("[data-sg], .sgl-cta, .sgl-n, .lenis").count()).toBe(0);
    await expect(page.locator("html")).not.toHaveClass(/lenis/);

    // Every box of the page is where the base site has it, and as large.
    await scrollTo(page, 0);
    const boxes = (view: Page) => view.evaluate(() => [...document.querySelectorAll<HTMLElement>("body *:not(script):not(.sgl-w):not(.sgl-i)")].map((element) => `${element.tagName}.${element.className} ${element.offsetLeft},${element.offsetTop} ${element.offsetWidth}x${element.offsetHeight}`));
    expect(await boxes(page)).toEqual(await boxes(base));
    expect(await pageHeight(page)).toBe(await pageHeight(base));
    expect(errors).toEqual([]);
  });

  test("no layout shift, no sideways scroll, and smooth scrolling only once someone scrolls", async ({ page }) => {
    const errors = collectErrors(page);
    await record(page, ".lead-title", ".lead-picture");
    await page.addInitScript(() => {
      const shifts: { value: number; sources: string[] }[] = [];
      (window as unknown as { sgShifts: typeof shifts }).sgShifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[] })[]) {
          // What moved, from where to where, and where the page and the floating link were: a failure then says why.
          if (!entry.hadRecentInput) shifts.push({ value: entry.value, sources: [`at ${Math.round(scrollY)} px, call to action "${document.querySelector(".sgl-cta")?.className ?? ""}"`, ...(entry.sources ?? []).map((source) => `${source.node instanceof Element ? `${source.node.tagName}.${source.node.className}` : "?"} ${Math.round(source.previousRect.left)},${Math.round(source.previousRect.top)} → ${Math.round(source.currentRect.left)},${Math.round(source.currentRect.top)}`)] });
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(ENHANCED);
    expect(await page.evaluate(() => document.documentElement.dataset.sgSmooth)).toBeUndefined();
    // Scrolling by script is not input, so every shift on the way counts, as it does for a visitor's wheel.
    await scrollTo(page, await pageHeight(page), 80);
    await settled(page);
    await scrollTo(page, 0, 80);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { sgShifts: unknown[] }).sgShifts)).toEqual([]);
    expect((await frames(page)).some((frame) => frame.wide), "wider than the screen on some frame").toBe(false);

    // The first wheel notch starts smooth scrolling (the editorial preset has it), and the page still reaches where it is sent.
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 240);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.sgSmooth), { timeout: 15_000 }).toBe("on");
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => scrollY), { timeout: 10_000 }).toBeGreaterThan(400);
    expect(errors).toEqual([]);
  });

  test("keyboard: whatever takes focus is shown at once, in view and never under the floating link", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(ENHANCED);
    await expect(page.locator(".sgl-cta")).toHaveClass(/is-ready/, { timeout: 15_000 });
    const count = await page.evaluate(() => document.querySelectorAll("a[href]").length);
    let reached = 0;
    for (let at = 0; at < count; at++) {
      await page.keyboard.press("Tab");
      const state = () => page.evaluate(async () => {
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
        const element = document.activeElement as HTMLElement;
        if (!element || element === document.body) return null;
        const box = element.getBoundingClientRect();
        // What is drawn on top at the middle of the focused element's first line: itself, unless a later card or the floating link covers it.
        const line = element.getClientRects()[0] ?? box;
        const top = document.elementFromPoint(line.left + line.width / 2, line.top + line.height / 2);
        return {
          name: `${element.textContent?.trim()} → ${element.getAttribute("href")}`,
          // Not inside anything still waiting for the scroll, and not see-through.
          waiting: Boolean(element.closest('[data-sgl-s="wait"]')),
          visible: element.checkVisibility({ opacityProperty: true, visibilityProperty: true }),
          inView: box.bottom > 0 && box.top < innerHeight,
          covered: !(top && (top === element || element.contains(top))),
        };
      });
      const focus = await state();
      expect(focus, `Tab ${at + 1}`).not.toBeNull();
      reached++;
      // Shown at once and in view; the floating link, if it stood there, has half a second to slide out of the way.
      expect(focus, focus!.name).toMatchObject({ waiting: false, visible: true, inView: true });
      await expect.poll(async () => (await state())?.covered, { message: focus!.name, timeout: 5_000 }).toBe(false);
    }
    // Every link of the page was reached, the ones inside the stacked cards and the waiting text included.
    expect(reached).toBe(count);
    expect(errors).toEqual([]);
  });

  test("axe finds nothing, at the top, mid-page and at the foot, on both pages", async ({ page }) => {
    const errors = collectErrors(page);
    const check = async () => {
      await settled(page);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations).toEqual([]);
    };
    await page.goto(ENHANCED);
    await check();
    await scrollTo(page, (await topOf(page, ".step-list")) - 100);
    await check();
    await scrollTo(page, await pageHeight(page));
    await check();
    await page.goto(`${ENHANCED}om/`);
    await expect(page.locator("html")).toHaveClass(/sgl/);
    await expect(page.locator(".lead-title")).toHaveAttribute("data-sgl-s", "done", { timeout: 15_000 });
    await check();
    expect(errors).toEqual([]);
  });
});

test.describe("Signature layer, the enhancer", () => {
  test.beforeEach(() => test.skip(test.info().project.name !== "desktop", "No browser in these: once is enough."));

  const page = (path: string) => ({ path, text: `<!doctype html>\n<html lang="fi">\n<head>\n<title>x</title>\n<link rel="stylesheet" href="./site.css">\n</head>\n<body class="d-cafe"><h1>Hei</h1></body>\n</html>` });

  test("adds three tags to each head with the page's own root, and returns the files to add", () => {
    const files = [page("index.html"), page("meista/index.html"), page("a/b/index.html"), { path: "site.css", text: "body{}" }, { path: "robots.txt", text: "" }];
    const result = enhanceSite(files, { map: "services", preset: "auto" });
    expect(result.files.map((file) => file.path)).toEqual(["index.html", "meista/index.html", "a/b/index.html"]);
    expect(result.files[0].text).toContain('<link rel="stylesheet" href="./signature/layer.css">\n<link rel="modulepreload" href="./signature/layer.js">\n<script type="module" src="./signature/site.js" blocking="render"></script>');
    expect(result.files[1].text).toContain('src="../signature/site.js"');
    expect(result.files[2].text).toContain('href="../../signature/layer.css"');
    // Only the head changed: take the block out and the page is the one that came in.
    for (const [at, file] of result.files.entries()) expect(file.text.replace(/<!-- signature-layer[\s\S]*?<!-- \/signature-layer -->\n/, "")).toBe(files[at].text);
    // The body is untouched, and the tags come last in the head, after the site's own stylesheet.
    expect(result.files[0].text.indexOf("signature/layer.css")).toBeGreaterThan(result.files[0].text.indexOf("site.css"));
    expect(result.files[0].text.indexOf("signature/site.js")).toBeLessThan(result.files[0].text.indexOf("</head>"));

    expect(result.assets.map((asset) => asset.path).sort()).toEqual(["signature/count.js", "signature/cta.js", "signature/layer.css", "signature/layer.js", "signature/list.js", "signature/site.js", "signature/smooth.js"]);
    expect(result.assets.every((asset) => asset.text.length > 0 && /^text\/(javascript|css); charset=utf-8$/.test(asset.contentType))).toBe(true);
    const site = result.assets.find((asset) => asset.path === "signature/site.js")!.text;
    expect(site).toMatch(/^import\{start\}from"\.\/layer\.js";start\(\{"preset":"auto","presets":\[/);
    expect(site).toContain('{"when":"body.d-cafe","preset":"warm"}');
  });

  test("a given root is used for every page, a second run replaces the first, and a fixed preset needs no table", () => {
    const once = enhanceSite([page("index.html"), page("meista/index.html")], { map: "services", preset: "calm", root: "/asiakas/lyyti", dir: "_sig" });
    expect(once.files[1].text).toContain('src="/asiakas/lyyti/_sig/site.js"');
    expect(once.assets.every((asset) => asset.path.startsWith("_sig/"))).toBe(true);
    expect(once.assets.find((asset) => asset.path === "_sig/site.js")!.text).toContain('start({"preset":"calm","rules":[');
    const twice = enhanceSite(once.files, { map: "services", preset: "calm" });
    expect(twice.files[1].text.match(/signature-layer/g)).toHaveLength(2);
    expect(twice.files[1].text).toContain('src="../signature/site.js"');
    expect(twice.files[1].text).not.toContain("_sig");
  });

  test("refuses what it does not know, and maps every Website Factory direction to a preset", () => {
    expect(() => enhanceSite([], { map: "services", preset: "loud" as never })).toThrow(/no preset called loud/);
    expect(() => enhanceSite([], { map: "nothing" as never, preset: "calm" })).toThrow(/no map called nothing/);
    expect(() => enhanceSite([], { map: { rules: [{ module: "sparkle" as never, select: "h1" }] }, preset: "calm" })).toThrow(/no module called sparkle/);
    expect(() => enhanceSite([], { map: { rules: [] }, preset: "auto" })).toThrow(/preset auto needs a map/);
    expect(DIRECTION_PRESETS).toEqual({ formal: "calm", clinic: "calm", cafe: "warm", atelier: "editorial", editorial: "editorial", statement: "bold" });
    expect(presetForDirection("cafe")).toBe("warm");
    expect(presetForDirection("something-new")).toBe("calm");
  });

  test("the association map: calm, by name or by itself, with nothing a calm page cannot use and no form", () => {
    expect(ASSOCIATION_PRESET).toBe("calm");
    expect(Object.keys(MAPS)).toEqual(["services", "association"]);
    const fixed = enhanceSite([page("index.html")], { map: "association", preset: ASSOCIATION_PRESET });
    expect(fixed.files[0].text).toContain('src="./signature/site.js"');
    expect(fixed.assets.find((asset) => asset.path === "signature/site.js")!.text).toContain('start({"preset":"calm","rules":[{"module":"headline","select":"main h1"}');
    // "auto" gives the same preset on every page: the system has no directions.
    const auto = enhanceSite([page("index.html")], { map: "association", preset: "auto" });
    expect(auto.assets.find((asset) => asset.path === "signature/site.js")!.text).toContain('"presets":[{"when":"body","preset":"calm"}]');
    const rules = MAPS.association.rules;
    expect([...new Set(rules.map((rule) => rule.module))].sort()).toEqual(["headline", "reveal", "rise"]);
    // Everything is inside main (the header and footer stand), and no rule names a form or what holds one.
    for (const rule of rules) for (const part of rule.select.split(",")) expect(part.trim(), part).toMatch(/^main /);
    expect(rules.map((rule) => rule.select).join(" ")).not.toMatch(/form|input|label|\.field|\.check|\.pagehead > \.wrap > \.split\b/);
  });

  test("the kept build in layer-dist/ is current with its source", () => {
    // Fails when src/layer (or what it imports) has changed without `npm run build:layer`.
    const output = execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-layer.mjs", import.meta.url)), "--check"], { encoding: "utf8" });
    expect(output).toContain("is current");
  });
});
