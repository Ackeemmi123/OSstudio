/**
 * The Signature layer's proof: built sites, enhanced, photographed beside
 * their base versions, for a person to judge whether the motion fits.
 *
 *   node scripts/layer-proof.mjs                       # Website Factory's invented industry examples
 *   node scripts/layer-proof.mjs name=dir[:preset] …   # any built sites (preset: auto by default)
 *
 * Each site is copied to `../proof/out/signature-layer/<name>/base` and
 * enhanced into `…/<name>/enhanced` (map `services`), served from port 4407,
 * and opened on desktop (1440 × 900) and a phone (Pixel 7), at the top and
 * at five more scroll points. Every point is photographed three ways:
 *
 *   base, at rest · enhanced, 350 ms into its motion · enhanced, at rest
 *
 * The middle one is exact, however busy the machine: every time-based
 * animation that starts is held and set to 350 ms (scroll-driven ones follow
 * the scroll as always), photographed, and let go. The base site is held the
 * same way for a fourth picture, base at 350 ms, so the two kinds of motion
 * can be compared at the same instant.
 *
 * Output: `review/layer/<name>-<device>.jpg` (a sheet per site and device)
 * and the single pictures in `review/layer/<name>/`. Both are git-ignored.
 */
import { createServer } from "node:http";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { chromium, devices } from "@playwright/test";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const PORT = 4407;
const EXAMPLES = join(HERE, "../proof/out/industry-examples");
const STAGE = join(HERE, "../proof/out/signature-layer");
const OUT = join(HERE, "review/layer");
const HOLD = 350;

const chosen = process.argv.slice(2).filter((arg) => arg.includes("="));
const sites = chosen.length
  ? chosen.map((arg) => {
      const [name, rest] = arg.split("=");
      const [dir, preset] = rest.split(":");
      return { name, dir: resolve(dir), preset: preset ?? "auto" };
    })
  : ["juridiikka", "kahvila", "sisustus", "hyvinvointi"].map((name) => ({ name, dir: join(EXAMPLES, name), preset: "auto" }));

for (const site of sites) {
  if (!existsSync(join(site.dir, "index.html"))) {
    console.error(`No built site at ${site.dir}. For the industry examples: npx vitest run proof/concepts/industry-examples.render.ts (in the repository's top folder).`);
    process.exit(1);
  }
  rmSync(join(STAGE, site.name), { recursive: true, force: true });
  cpSync(site.dir, join(STAGE, site.name, "base"), { recursive: true });
  execFileSync(process.execPath, [join(HERE, "scripts/enhance.mjs"), join(STAGE, site.name, "base"), "--out", join(STAGE, site.name, "enhanced"), "--map", "services", "--preset", site.preset], { stdio: "inherit" });
}

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".woff2": "font/woff2", ".webp": "image/webp", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".txt": "text/plain; charset=utf-8" };
const server = createServer((request, response) => {
  let file = normalize(join(STAGE, decodeURIComponent(new URL(request.url, "http://x").pathname)));
  if (!file.startsWith(STAGE)) return response.writeHead(403).end();
  // The sites have no icon; Chrome asks for one anyway, and a 404 would count as a console error.
  if (request.url === "/favicon.ico") return response.writeHead(204).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) return response.writeHead(404).end("Not found");
  response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(readFileSync(file));
});
await new Promise((done, fail) => server.once("error", fail).listen(PORT, "127.0.0.1", done));

/** In the page: holds every time-based animation at `window.__hold` ms while that is a number. */
const holder = () => {
  const held = new WeakSet();
  window.__hold = null;
  const tick = () => {
    if (typeof window.__hold === "number") {
      for (const animation of document.getAnimations()) {
        if (held.has(animation) || !(animation.timeline instanceof DocumentTimeline)) continue;
        const timing = animation.effect?.getComputedTiming();
        if (!timing || !Number.isFinite(timing.endTime)) continue;
        held.add(animation);
        animation.pause();
        animation.currentTime = window.__hold;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__release = () => {
    window.__hold = null;
    for (const animation of document.getAnimations()) if (animation.playState === "paused") animation.play();
  };
};

const browser = await chromium.launch({ channel: process.env.CI ? "chromium" : "chrome" });
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const frames = (page, count = 3) => page.evaluate((n) => new Promise((done) => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : done()); step(); }), count);

async function capture(site, version, device, hold) {
  const context = await browser.newContext(device.name === "phone" ? { ...devices["Pixel 7"] } : { viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.addInitScript(holder);
  if (hold) await page.addInitScript((ms) => addEventListener("DOMContentLoaded", () => (window.__hold = ms)), HOLD);
  await page.goto(`http://127.0.0.1:${PORT}/${site.name}/${version}/`, { waitUntil: "load", timeout: 180_000 });
  const tall = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const points = [0, 0.18, 0.36, 0.54, 0.72, 0.9].map((part) => Math.round(part * tall));
  const shots = [];
  const folder = join(OUT, site.name);
  mkdirSync(folder, { recursive: true });
  for (const [at, y] of points.entries()) {
    if (at) {
      if (hold) await page.evaluate((ms) => (window.__hold = ms), HOLD);
      await page.evaluate((top) => scrollTo({ top, behavior: "instant" }), y);
    }
    await frames(page, 4);
    await wait(250);
    await frames(page, 2);
    if (hold) {
      const file = join(folder, `${device.name}-${at}-${version}-moving.jpg`);
      await page.screenshot({ path: file, type: "jpeg", quality: 70, scale: "css" });
      shots.push(file);
      await page.evaluate(() => window.__release());
    }
    // At rest: pictures in view have loaded, time-based animations have ended.
    await page.evaluate(() => Promise.all([...document.images].filter((image) => { const box = image.getBoundingClientRect(); return box.bottom > 0 && box.top < innerHeight; }).map((image) => image.decode().catch(() => undefined))));
    await page.waitForFunction(() => document.getAnimations().every((animation) => !(animation.timeline instanceof DocumentTimeline) || animation.playState !== "running" || !Number.isFinite(animation.effect?.getComputedTiming().endTime)), null, { timeout: 20_000 }).catch(() => undefined);
    await wait(300);
    const file = join(folder, `${device.name}-${at}-${version}-rest.jpg`);
    await page.screenshot({ path: file, type: "jpeg", quality: 70, scale: "css" });
    shots.push(file);
  }
  const state = await page.evaluate(() => ({ preset: document.documentElement.dataset.sglPreset ?? null, mapped: document.querySelectorAll("[data-sgl]").length, waiting: document.querySelectorAll('[data-sgl-s="wait"]').length }));
  await context.close();
  return { shots, errors, state, points };
}

const summary = [];
for (const site of sites) {
  for (const device of [{ name: "desktop", width: 1440 }, { name: "phone", width: 412 }]) {
    const base = await capture(site, "base", device, true);
    const enhanced = await capture(site, "enhanced", device, true);
    summary.push(`${site.name} ${device.name}: preset ${enhanced.state.preset}, ${enhanced.state.mapped} elements mapped, ${enhanced.state.waiting} still waiting at the foot of the page, console errors: base ${base.errors.length}, enhanced ${enhanced.errors.length}${enhanced.errors.length ? ` (${enhanced.errors[0]})` : ""}`);
    // The sheet: one row per scroll point, base at 350 ms and at rest, enhanced at 350 ms and at rest.
    const cell = (file) => `<img src="${pathToFileURL(file).href}">`;
    const rows = base.points.map((y, at) => `<tr><th>${y} px</th><td>${cell(base.shots[at * 2])}</td><td>${cell(base.shots[at * 2 + 1])}</td><td>${cell(enhanced.shots[at * 2])}</td><td>${cell(enhanced.shots[at * 2 + 1])}</td></tr>`).join("");
    const width = device.name === "phone" ? 230 : 470;
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:12px;font:13px system-ui;background:#fff}table{border-collapse:collapse}th,td{padding:3px;vertical-align:top;text-align:left}img{display:block;width:${width}px;border:1px solid #ccc}</style><h3>${site.name}, ${device.name}, preset ${enhanced.state.preset}</h3><table><tr><th></th><th>Base, ${HOLD} ms into its motion</th><th>Base, at rest</th><th>Enhanced, ${HOLD} ms into its motion</th><th>Enhanced, at rest</th></tr>${rows}</table>`;
    const sheetPage = join(OUT, site.name, `${device.name}.html`);
    writeFileSync(sheetPage, html);
    const sheet = await browser.newPage({ viewport: { width: width * 4 + 110, height: 800 } });
    await sheet.goto(pathToFileURL(sheetPage).href);
    await sheet.screenshot({ path: join(OUT, `${site.name}-${device.name}.jpg`), fullPage: true, type: "jpeg", quality: 72 });
    await sheet.close();
    console.log(summary.at(-1));
  }
}
await browser.close();
server.close();
writeFileSync(join(OUT, "summary.txt"), `${summary.join("\n")}\n`);
console.log(`\nSheets: ${OUT}`);
