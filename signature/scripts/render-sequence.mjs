/**
 * Renders the lab's image sequence to lab/public/sekvens/ (WebP), from the
 * film's tool page lab/verktyg/film.html: the engine's own 3D band, from its
 * eight loose pieces to the whole band, turning as it gathers, one picture per
 * step. The sequence module (`data-sg="sequence"`) draws them on a canvas as
 * the page scrolls. Two sizes: wide for screens, tall for phones. Nothing is
 * filmed or bought: Axivo owns every pixel.
 *
 * Needs the dev server: `npm run dev`, then `node scripts/render-sequence.mjs`
 * (or pass its address). `ONLY=telefon` renders just that size;
 * `FRAMES=0,30,59` renders just those pictures, and `OUT=/some/folder` writes
 * them there instead of the lab, for trying settings.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:4316";
const LAB = fileURLToPath(new URL("../lab/", import.meta.url));
const OUT = process.env.OUT ?? LAB;
// Drawn at three times the picture's size: the push in cuts the last picture from the middle of the frame.
const SUPERSAMPLE = 3;
// The library's colours: ink, tint, metal, glow (as on its band and its film).
const COLOURS = ["#151922", "#4a5bb5", "#c9d9f0", "#879dc7"];
const FRAMES = 60;
const ONLY_FRAMES = process.env.FRAMES?.split(",").map(Number);

/**
 * The band's clock runs over the last third of the film's twelve-second loop (8 to 12 s, which is 0 again): the
 * pieces drift as they close up and the band turns 120° in its own plane, and the last picture is the film's first,
 * at the film's framing (zoom × push) and lean. So the sequence ends on the poster of the library's film, its top and
 * bottom edges faded into the ink of the section and the footer around it.
 */
const SHARED = { frames: FRAMES, supersample: SUPERSAMPLE, colours: COLOURS, from: 8, to: 12, loop: 12, tilt: 0.3, fade: [0.14, 0.08] };

const SEQUENCES = [
  { name: "bred", folder: "public/sekvens/bred", width: 1600, height: 900, zoom: 1.0, push: 1.55, quality: 0.8 },
  // Tall for phones, in a phone's own shape (19.5:9), so the band is never cut at the sides; the extra height is
  // backdrop, which costs almost nothing. Looser than the phone film: in a narrower frame the band is wider for its height.
  { name: "telefon", folder: "public/sekvens/telefon", width: 720, height: 1560, zoom: 0.78, push: 0.98 / 0.78, quality: 0.66 },
].map((sequence) => ({ ...SHARED, ...sequence }));

const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", args: ["--enable-unsafe-swiftshader"] });
for (const sequence of SEQUENCES) {
  if (process.env.ONLY && !sequence.name.includes(process.env.ONLY)) continue;
  // The band draws at twice the CSS size at most; the tool page makes its canvas large enough for the supersample.
  const page = await browser.newPage({ viewport: { width: 1700, height: 1400 }, deviceScaleFactor: 2 });
  page.on("console", (message) => message.type() === "error" && console.error(`  page: ${message.text()}`));
  await page.goto(`${BASE}/verktyg/film.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.filmReady === true, null, { timeout: 60_000 });
  const { files, log } = await page.evaluate((sequence) => window.renderSequence(sequence), { ...sequence, only: ONLY_FRAMES });
  for (const line of log) console.log(line);
  for (const [file, data] of Object.entries(files)) {
    const path = join(OUT, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(data, "base64"));
  }
  await page.close();
}
await browser.close();
