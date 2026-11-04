/**
 * Automated QA of a built site, in a real browser, at the widths people use.
 * It judges what a visitor would get, not the data behind it. It cannot judge
 * whether a page is beautiful: a person still does that.
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";

export const WIDTHS = [390, 768, 1024, 1280, 1440, 1920];

/** Where motion is checked: a phone and a laptop. */
const MOTION_WIDTHS = [390, 1280];

/** Stock photos, for this proof only. Anything else from outside the site is a failure. */
const ALLOWED_HOSTS = new Set(["images.unsplash.com"]);

/** The most a page may weigh without its photos, in bytes. Set from the first built sites. */
const BUDGET_WITHOUT_IMAGES = 500_000;

const LEFTOVERS = [
  { pattern: /\[[^\]\n]*\p{L}{2}[^\]\n]*\]/u, what: "an instruction in square brackets" },
  { pattern: /lorem ipsum/i, what: "lorem ipsum" },
  { pattern: /\b(?:TODO|TBD|FIXME)\b/, what: "a draft marker" },
];

/** Words that claim something a client must confirm. The same idea as Studio OS's approval warnings. */
const CLAIMS = [
  /\b\d+(?:[.,]\d+)?\s?%/,
  /\b(?:award[- ]winning|awards?|prisbelönt\w*|palkittu\w*|palkinto\w*)/i,
  /\b(?:certified|accredited|licensed|certifierad\w*|sertifioitu\w*)/i,
  /\b(?:guarantee[ds]?|money[- ]back|garanti\w*|takuu\w*)/i,
  /(?:#\s?1\b|\bnumber one\b|\bthe best\b|\bbest in\b|\bleading\b|\bbäst\w*|\bledande\b|\bparas\b|\bparhaat\b|\bjohtava\w*)/i,
];

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".woff2": "font/woff2", ".txt": "text/plain", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

function serve(root) {
  const server = createServer((request, response) => {
    let file = path.join(root, decodeURIComponent(new URL(request.url, "http://x").pathname));
    if (!file.startsWith(root)) return response.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` })));
}

/** Everything the page can check about itself, run inside the browser. */
function readPage() {
  const visible = (el) => {
    const box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const offscreen = [...document.querySelectorAll("body *")]
    .filter((el) => visible(el) && !el.closest(".skip,.trap") && el.getBoundingClientRect().right > innerWidth + 1)
    .slice(0, 5)
    .map((el) => el.tagName.toLowerCase() + (el.className ? `.${String(el.className).split(" ")[0]}` : ""));
  const clipped = [...document.querySelectorAll("h1,h2,h3,p,a,button,li,label,summary")]
    .filter((el) => visible(el) && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && getComputedStyle(el).display !== "inline")
    .slice(0, 5)
    .map((el) => (el.textContent ?? "").trim().slice(0, 40));
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    offscreen,
    clipped,
    text: document.body.innerText,
    lang: document.documentElement.lang,
    title: document.title,
    callBelowFirstScreen: document.body.classList.contains("has-call-bar") && (document.querySelector('.hero a[href^="tel:"]')?.getBoundingClientRect().bottom ?? 0) > innerHeight,
    description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "",
    h1s: document.querySelectorAll("h1").length,
    links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
    ids: [...document.querySelectorAll("[id]")].map((el) => el.id),
    images: [...document.images].map((img) => ({ src: img.currentSrc || img.src, alt: img.getAttribute("alt"), loaded: img.complete && img.naturalWidth > 0, sized: img.hasAttribute("width") && img.hasAttribute("height") })),
    forms: [...document.forms].map((form) => ({
      method: form.getAttribute("method"),
      submit: !!form.querySelector('button[type="submit"]'),
      trap: !!form.querySelector(".trap input"),
      required: [...form.querySelectorAll("[required]")].map((field) => field.getAttribute("name")),
    })),
  };
}

/** Scrolls the whole page with motion on, and returns any words that are still faint or cut off once they reach the middle of the screen. */
async function findHiddenByMotion() {
  document.documentElement.style.scrollBehavior = "auto";
  const moving = [...new Set(document.getAnimations().map((animation) => animation.effect?.target).filter((el) => el && !el.closest("[aria-hidden]")))];
  const hidden = new Set();
  const lastY = document.documentElement.scrollHeight - innerHeight;
  const settle = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  for (let y = 0; y <= lastY + 120; y += 120) {
    scrollTo(0, y);
    await settle();
    for (const el of moving) {
      const box = el.getBoundingClientRect();
      const middle = (box.top + box.bottom) / 2;
      if (middle < innerHeight * 0.35 || middle > innerHeight * 0.6) continue;
      const style = getComputedStyle(el);
      const cut = /^inset\(\S+ ([\d.]+)%/.exec(style.clipPath);
      if (Number(style.opacity) < 0.9 || (cut && Number(cut[1]) > 5)) hidden.add((el.textContent ?? "").trim().slice(0, 40) || el.tagName);
    }
  }
  return [...hidden].slice(0, 5);
}

/** Motion must never keep words from a visitor, and must stop for anyone who asks their device for less. */
async function checkMotion(browser, origin, fail) {
  for (const width of MOTION_WIDTHS) {
    const moving = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await moving.newPage();
    await page.goto(`${origin}/`, { waitUntil: "load" });
    // Let what plays once on arrival finish: this is about words left hidden, not ones still arriving.
    await page.evaluate(() => Promise.race([Promise.allSettled(document.getAnimations().filter((animation) => animation.timeline === document.timeline && Number.isFinite(animation.effect?.getComputedTiming().endTime)).map((animation) => animation.finished)), new Promise((done) => setTimeout(done, 5000))]));
    const hidden = await page.evaluate(findHiddenByMotion);
    if (hidden.length) fail("motion-hides-words", `/ at ${width}px`, hidden.join(" | "));
    await moving.close();
    const still = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const quiet = await still.newPage();
    await quiet.goto(`${origin}/`, { waitUntil: "load" });
    const running = await quiet.evaluate(() => document.getAnimations().length);
    if (running) fail("motion-not-off", `/ at ${width}px`, `${running} animations with reduced motion on`);
    await still.close();
  }
}

/**
 * Runs every check on one built site. `confirmedFacts` is what the client has
 * confirmed: a claim word on a page must appear there. Returns the failures and
 * measurements; a site passes when `failures` is empty.
 */
export async function runQa(root, { widths = WIDTHS, confirmedFacts = [], shotsTo = null, browser: given = null } = {}) {
  const { server, origin } = await serve(path.resolve(root));
  const browser = given ?? (await chromium.launch({ channel: "chrome" }));
  const failures = [];
  const seen = new Set();
  const fail = (check, where, detail) => {
    const key = `${check}|${where}|${detail}`;
    if (!seen.has(key)) failures.push({ check, where, detail });
    seen.add(key);
  };
  const facts = confirmedFacts.join(" ").toLowerCase();
  const measures = { pages: 0, largestWithoutImages: 0, scripts: 0 };
  const pages = new Set(["/", "/404.html", "/sent/", "/not-sent/"]);
  const done = new Set();
  if (shotsTo) mkdirSync(shotsTo, { recursive: true });

  try {
    while (done.size < pages.size) {
      const url = [...pages].find((candidate) => !done.has(candidate));
      done.add(url);
      measures.pages += 1;
      for (const width of widths) {
        // The finished page, with motion off, so nothing is judged halfway through an animation.
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
        const page = await context.newPage();
        let bytes = 0;
        page.on("response", async (response) => {
          const requested = new URL(response.url());
          if (requested.origin === origin && response.status() >= 400 && !(url === "/404.html" && requested.pathname === url)) fail("broken-file", url, requested.pathname);
          if (requested.origin === origin) bytes += Number(response.headers()["content-length"] ?? 0) || (await response.body().catch(() => Buffer.alloc(0))).length;
        });
        page.on("request", (request) => {
          const requested = new URL(request.url());
          if (request.resourceType() === "script") fail("script", url, request.url());
          if (requested.protocol.startsWith("http") && requested.origin !== origin && !ALLOWED_HOSTS.has(requested.hostname)) fail("outside-request", url, requested.hostname);
        });
        await page.goto(origin + url, { waitUntil: "load" });
        await page.evaluate(async () => {
          document.querySelectorAll("img").forEach((img) => (img.loading = "eager"));
          await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((done) => ((img.onload = done), (img.onerror = done), setTimeout(done, 8000))))));
          await document.fonts.ready;
        });
        const read = await page.evaluate(readPage);
        const where = `${url} at ${width}px`;

        if (read.overflow > 0) fail("sideways-scroll", where, `${read.overflow}px too wide: ${read.offscreen.join(", ")}`);
        else if (read.offscreen.length) fail("off-screen", where, read.offscreen.join(", "));
        if (read.clipped.length) fail("clipped-text", where, read.clipped.join(" | "));

        if (url === "/" && read.callBelowFirstScreen) fail("call-below-first-screen", where, "the phone number is not on the first screen");

        const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        for (const violation of violations) fail(`accessibility:${violation.id}`, where, violation.nodes.slice(0, 2).map((node) => node.target.join(" ")).join(", "));

        if (shotsTo) await page.screenshot({ path: path.join(shotsTo, `${url.replace(/\W+/g, "-").replace(/^-|-$/g, "") || "home"}-${width}.jpg`), fullPage: true, type: "jpeg", quality: 70 });

        if (width === widths[0]) {
          measures.largestWithoutImages = Math.max(measures.largestWithoutImages, bytes);
          if (bytes > BUDGET_WITHOUT_IMAGES) fail("page-weight", url, `${bytes} bytes without images`);
          if (!read.lang) fail("page-language", url, "no language");
          if (!read.title) fail("page-title", url, "no title");
          if (!read.description) fail("page-description", url, "no description");
          if (read.h1s !== 1) fail("headings", url, `${read.h1s} main headings`);
          for (const { pattern, what } of LEFTOVERS) {
            const found = pattern.exec(read.text);
            if (found) fail("leftover-text", url, `${what}: ${found[0].slice(0, 60)}`);
          }
          for (const pattern of CLAIMS) {
            const found = pattern.exec(read.text);
            if (found && !facts.includes(found[0].toLowerCase())) fail("unconfirmed-claim", url, found[0]);
          }
          for (const image of read.images) {
            if (!image.alt?.trim()) fail("image-alt", url, image.src.slice(0, 80));
            if (!image.loaded) fail("image-broken", url, image.src.slice(0, 80));
            if (!image.sized) fail("image-size", url, image.src.slice(0, 80));
          }
          for (const form of read.forms) {
            if (form.method !== "post" || !form.submit) fail("form", url, "cannot be sent");
            if (!form.trap) fail("form", url, "no spam trap");
            if (!form.required.includes("email")) fail("form", url, "email not required");
          }
          for (const href of read.links) {
            if (/^(tel:\+?\d{5,}|mailto:\S+@\S+)$/.test(href)) continue;
            if (/^(tel|mailto):/.test(href)) {
              fail("broken-link", url, href);
              continue;
            }
            const target = new URL(href, origin + url);
            if (target.origin !== origin) {
              fail("outside-link", url, href);
              continue;
            }
            const response = await context.request.get(target.origin + target.pathname);
            if (!response.ok()) {
              fail("broken-link", url, href);
              continue;
            }
            if (target.hash) {
              const samePage = target.pathname === new URL(url, origin).pathname;
              const ids = samePage ? read.ids : (await response.text()).match(/\bid="[^"]+"/g)?.map((id) => id.slice(4, -1)) ?? [];
              if (!ids.includes(target.hash.slice(1))) fail("broken-anchor", url, href);
            }
            if (!/\.[a-z0-9]+$/i.test(target.pathname)) pages.add(target.pathname.endsWith("/") ? target.pathname : `${target.pathname}/`);
          }
        }
        await context.close();
      }
    }
    await checkMotion(browser, origin, fail);
  } finally {
    server.close();
    if (!given) await browser.close();
  }
  return { failures, measures };
}
