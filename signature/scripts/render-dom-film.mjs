/**
 * Films any animated page, deterministically, into signature/films/.
 *
 * The page's contract: it sets `window.sgFilm = { width, height, fps,
 * duration, seek(t) }` once it is ready (fonts in, pictures decoded, shaders
 * compiled), and `seek(t)` puts every animation at time t: a paused GSAP
 * timeline through `.seek()`, CSS animations through `document.getAnimations()`,
 * WebGL through a still drawn at t. Nothing on the page may run on a clock.
 * `seek` may return a promise; the renderer waits for it.
 *
 * A site that has no such contract (a client's site, any address) is filmed
 * by scripts/render-site-film.mjs, which steps the site itself one frame at
 * a time and hands the frames to this script through lab/verktyg/sitefilm.html.
 *
 * For each frame this script calls seek, waits for the fonts and two
 * animation frames, and photographs the page through Chrome's own
 * `Page.captureScreenshot`. No frame is taken on a timer, so the machine's
 * load changes how long the render takes and nothing else: the same page
 * gives the same frames. That is checked, not assumed: a spread of frames is
 * sought again afterwards, out of order, and must come back identical to the
 * pixel; the digest of all frames is written beside the film, so two runs
 * can be compared.
 *
 * The frames are encoded in Chrome with WebCodecs (lab/verktyg/encode.ts):
 * H.264 in MP4, which every social platform takes (a master, and a smaller
 * `-web.mp4` for a site), and where asked AV1 in WebM, smaller still. Each file is then played back in
 * the browser: it must last the whole film, show every frame, and start in
 * the colours it was given. A contact sheet of twelve frames is saved with it.
 *
 * Needs the dev server: `npm run dev`, then
 *
 *   npm run film                                  Axivo's three films (lab/verktyg/reel.html)
 *   npm run film -- --only story                  those whose name contains "story"
 *   npm run film -- --lang fi                     Axivo's films in Finnish (fi, en; Swedish without the flag), named …-fi
 *   npm run film -- --page verktyg/reel.html?film=wide --name prov --web --webm
 *                                                 any page with the contract (a path under the base, or a full address);
 *                                                 --web adds a smaller H.264 file, --webm an AV1 one
 *   npm run film -- --base http://127.0.0.1:4387  another dev server
 *   npm run film -- --sheet-only                  twelve frames and the sheet, nothing encoded: for reviewing a design
 *   npm run film -- --still 3.5,9.75              those moments as PNG, nothing else
 *   npm run film -- --scale 2                     photographed at twice the size and scaled down
 *
 * Uses the installed Chrome, whose WebCodecs can encode H.264 (Playwright's
 * Chromium cannot). The films stay local: signature/films/ is not in git.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);

const BASE = value("base", "http://127.0.0.1:4316").replace(/\/$/, "");
const OUT = new URL("../films/", import.meta.url);
const SCALE = Number(value("scale", 1));
const SHEET_FRAMES = 12;
/** How many frames are photographed a second time, out of order, to prove a frame depends on nothing but its time. */
const VERIFY = flag("no-verify") ? 0 : 10;
const STILLS = value("still", "")
  .split(",")
  .filter(Boolean)
  .map(Number);

/** H.264 high profile, level 4.0 (up to 1080p at 30), and AV1 main profile, level 4.0. */
const H264 = "avc1.640028";
const AV1 = "av01.0.08M.08";
/** A master for platforms that encode again themselves: about 8 Mbit/s at 1080p30. */
const mp4 = (name) => ({ file: `${name}.mp4`, codec: H264, bitsPerPixel: 0.13, hardware: "no-preference" });
/** For embedding on a site where H.264 is wanted: the same film at a bitrate a page can carry. */
const web = (name, bitrate) => ({ file: `${name}-web.mp4`, codec: H264, bitrate, hardware: "no-preference" });
/** For the web, smallest: AV1, within the lab's own film budget (scripts/budget.mjs). */
const webm = (name, bitrate) => ({ file: `${name}.webm`, codec: AV1, bitrate, hardware: "prefer-software" });

/**
 * Axivo's own films. Each gets the master (for Instagram and LinkedIn, which encode again) and a `-web.mp4` for a
 * site (about 4 MB for the two long films, 1.5 MB for the loop); the loop and the wide film also get AV1.
 */
const FILMS = [
  { name: "axivo-signature-story-1080x1920", page: "verktyg/reel.html?film=story", encodings: (name) => [mp4(name), web(name, 2_300_000)] },
  { name: "axivo-signature-loop-1080x1080", page: "verktyg/reel.html?film=loop", encodings: (name) => [mp4(name), web(name, 1_500_000), webm(name, 560_000)] },
  { name: "axivo-signature-wide-1920x1080", page: "verktyg/reel.html?film=wide", encodings: (name) => [mp4(name), web(name, 2_300_000), webm(name, 600_000)] },
];

/** Axivo's films exist in Swedish (the lab's own language, no suffix), Finnish and English. */
const LANG = value("lang", "sv");
if (!["sv", "fi", "en"].includes(LANG)) throw new Error(`--lang is sv, fi or en, not ${LANG}`);
const films = value("page")
  ? [{ name: value("name", "film"), page: value("page"), encodings: (name) => [mp4(name), ...(flag("web") ? [web(name, 2_300_000)] : []), ...(flag("webm") ? [webm(name, 600_000)] : [])] }]
  : FILMS.filter((film) => film.name.includes(value("only", ""))).map((film) => (LANG === "sv" ? film : { ...film, name: `${film.name}-${LANG}`, page: `${film.page}&lang=${LANG}` }));
if (!films.length) throw new Error(`No film matches --only ${value("only")}`);

const address = (page) => (/^https?:/.test(page) ? page : `${BASE}/${page.replace(/^\//, "")}`);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const save = (file, bytes) => {
  writeFileSync(new URL(file, OUT), bytes);
  console.log(`  ${`films/${file}`.padEnd(52)} ${String(Math.round(bytes.length / 1024)).padStart(6)} KB`);
};

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
  // One colour space from page to PNG whatever screen is attached; greyscale text edges; software WebGL where there is no
  // graphics card. The page itself is rasterised on the CPU: on the graphics card, type that had moved came back a level
  // off in a few dozen pixels from one visit to the next. WebGL still draws on the card.
  args: ["--force-color-profile=srgb", "--disable-lcd-text", "--hide-scrollbars", "--enable-unsafe-swiftshader", "--disable-gpu-rasterization"],
});

let failed = false;
// One film at a time: the machine is shared.
for (const film of films) {
  console.log(`\n${film.name}  (${address(film.page)})`);
  const started = Date.now();
  // The film's page and the encoder each in a context of their own, so neither is ever a background tab.
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SCALE, reducedMotion: "no-preference", colorScheme: "light" });
  const page = await context.newPage();
  page.on("console", (message) => message.type() === "error" && console.error(`  page: ${message.text()}`));
  page.on("pageerror", (error) => console.error(`  page: ${error.message}`));
  await page.goto(address(film.page), { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.sgFilm?.seek === "function", null, { timeout: 120_000 });
  const { width, height, fps, duration } = await page.evaluate(() => ({ width: window.sgFilm.width, height: window.sgFilm.height, fps: window.sgFilm.fps, duration: window.sgFilm.duration }));
  const frames = Math.round(fps * duration);
  if (![width, height, fps, frames].every((n) => Number.isInteger(n) && n > 0) || width % 2 || height % 2) throw new Error(`sgFilm must give whole, even sizes and a whole number of frames: ${width} × ${height}, ${fps} fps, ${duration} s`);
  // The page is laid out at the film's own size; the window is exactly that.
  await page.setViewportSize({ width, height });
  const cdp = await context.newCDPSession(page);
  // Chrome's window is given the viewport's size, and its own bars are taken out of that: the bottom of the page would be
  // photographed black. A window with room to spare shows all of it. (Capturing "beyond the viewport" would too, but it
  // lays the page out anew for each photograph, and the type's edges then differ from one photograph to the next.)
  const { windowId } = await cdp.send("Browser.getWindowForTarget");
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { width: width + 200, height: height + 300 } });

  const photograph = async () => (await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: false, optimizeForSpeed: true })).data;
  /**
   * Blank the page, seek, let it settle (fonts, then two animation frames so styles and layout are done), and photograph until
   * two photographs in a row are identical. Two animation frames are not always enough on a busy machine: what the
   * compositor draws itself (a WebGL canvas, a CSS transform animation) can reach the screen a frame late, and the
   * photograph would then show the frame before. A frame is taken only once the screen has stopped changing.
   */
  let retaken = 0;
  const shoot = async (index) => {
    await page.evaluate(async (t) => {
      const painted = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      // The page is blanked for a painted frame before each seek, so everything is drawn afresh at t. Chrome otherwise
      // keeps what it drew for the frame before where it judges it close enough (a letter that has just come to rest
      // kept a few pixels of its last step), and a frame would depend on the frames photographed before it.
      document.documentElement.style.visibility = "hidden";
      await painted();
      // A seek may return a promise (a page that fetches a picture for t): the frame is taken once it has settled.
      await window.sgFilm.seek(t);
      document.documentElement.style.visibility = "";
      await document.fonts.ready;
      await painted();
    }, index / fps);
    let data = await photograph();
    for (let tries = 0; ; tries++) {
      const next = await photograph();
      if (next === data) return data;
      if (tries === 8) throw new Error(`Frame ${index} (${(index / fps).toFixed(3)} s) never comes to rest: something on the page is still moving on its own clock`);
      retaken++;
      data = next;
    }
  };

  if (STILLS.length) {
    for (const t of STILLS) save(`${film.name}-${t.toFixed(2)}s.png`, Buffer.from(await shoot(Math.round(t * fps)), "base64"));
    await context.close();
    continue;
  }

  const sheetOnly = flag("sheet-only");
  const sheetFrames = Array.from({ length: SHEET_FRAMES }, (_, k) => Math.min(frames - 1, Math.round(((k + 0.5) * frames) / SHEET_FRAMES)));
  const encodings = sheetOnly ? [] : film.encodings(film.name).map(({ bitsPerPixel, ...encoding }) => ({ ...encoding, bitrate: encoding.bitrate ?? Math.round(width * height * fps * bitsPerPixel) }));

  const encoderContext = await browser.newContext({ viewport: { width: 640, height: 480 } });
  const encoder = await encoderContext.newPage();
  encoder.on("console", (message) => message.type() === "error" && console.error(`  encoder: ${message.text()}`));
  await encoder.goto(`${BASE}/verktyg/encode.html`, { waitUntil: "load" });
  await encoder.waitForFunction(() => Boolean(window.sgEncode), null, { timeout: 60_000 });
  const wide = width > height;
  await encoder.evaluate((job) => window.sgEncode.start(job), {
    width,
    height,
    fps,
    frames,
    encodings,
    sheet: { frames: sheetFrames, columns: wide ? 4 : 6, thumb: wide ? 480 : 320, title: `${film.name} · ${width} × ${height} · ${duration} s · ${fps} bilder/s` },
  });

  const hashes = [];
  const all = createHash("sha256");
  const wanted = sheetOnly ? sheetFrames : Array.from({ length: frames }, (_, index) => index);
  for (const index of wanted) {
    const png = await shoot(index);
    hashes[index] = sha(png);
    all.update(hashes[index]);
    await encoder.evaluate(([i, data]) => window.sgEncode.add(i, data), [index, png]);
    if (index % (fps * 2) === 0 && !sheetOnly) console.log(`  ${String(index).padStart(4)}/${frames}  ${((Date.now() - started) / 1000 / (index + 1)).toFixed(2)} s a frame`);
  }

  // A spread of the frames again, last to first: each must be identical to the pixel.
  const stride = Math.max(1, Math.floor(wanted.length / (VERIFY || 1)));
  const again = wanted.filter((_, place) => place % stride === Math.floor(stride / 3)).reverse();
  const differing = [];
  if (VERIFY) for (const index of again) if (sha(await shoot(index)) !== hashes[index]) differing.push(index);
  if (VERIFY) console.log(`  determinism: ${again.length - differing.length}/${again.length} frames identical when photographed again out of order; ${retaken} photographs retaken because the screen had not settled`);
  if (differing.length) {
    failed = true;
    console.error(`  NOT deterministic: frames ${differing.join(", ")} came back different. Something on the page runs on a clock, or is not ready when sgFilm is set.`);
  }

  const result = await encoder.evaluate(() => window.sgEncode.finish());
  for (const [file, data] of Object.entries(result.files)) save(file, Buffer.from(data, "base64"));
  save(`${film.name}-sheet.jpg`, Buffer.from(result.sheet, "base64"));
  for (const check of result.checks) {
    const problems = [];
    if (Math.abs(check.duration - duration) > 0.002) problems.push(`lasts ${check.duration} s, not ${duration}`);
    if (check.frames !== frames) problems.push(`plays ${check.frames} frames, not ${frames}`);
    if (check.shift.some((channel) => Math.abs(channel) > 2)) problems.push(`first frame decodes in other colours (${check.shift.join(" ")})`);
    console.log(`  ${check.file}: ${check.duration.toFixed(3)} s, ${check.frames} frames played back; first frame: colour shift ${check.shift.join(" ")}, mean difference ${check.mean} levels${problems.length ? `  FAILED: ${problems.join("; ")}` : "  ok"}`);
    if (problems.length) failed = true;
  }
  if (!sheetOnly) {
    const manifest = { name: film.name, page: film.page, width, height, fps, duration, frames, scale: SCALE, framesDigest: all.digest("hex"), deterministic: differing.length === 0 && VERIFY > 0, encodings, checks: result.checks };
    save(`${film.name}.json`, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
  }
  console.log(`  ${Math.round((Date.now() - started) / 1000)} s`);
  await context.close();
  await encoderContext.close();
}
await browser.close();
if (failed) process.exit(1);
