/**
 * Renders the lab's image sequence to lab/public/sekvens/, from the film's
 * tool page lab/verktyg/film.html: the engine's own 3D band, from its eight
 * loose pieces to the whole band, turning as it gathers, one picture per
 * step. The sequence module (`data-sg="sequence"`) draws them on a canvas as
 * the page scrolls. Nothing is filmed or bought: Axivo owns every pixel.
 *
 * Two steps. The tool page draws every picture once, as a lossless master
 * (Chrome's WebP at quality 1 is lossless), larger than any set that is
 * saved. Then sharp (libvips, a dev dependency: nothing of it reaches a site)
 * scales and encodes each master here in Node, as WebP: libwebp at its
 * greatest effort, from a lossless picture, makes the same quality about 5 %
 * smaller than Chrome's canvas did, which the phone's set spends on a higher
 * quality (72, where the canvas had room for 66). AVIF was tried and left:
 * a browser takes two to three times as long to decode it, and the picture
 * then fell behind the scroll on a busy machine.
 *
 * Needs the dev server: `npm run dev`, then `node scripts/render-sequence.mjs`
 * (or pass its address). `ONLY=telefon` renders just that shape;
 * `FRAMES=0,30,60` just those pictures, and `OUT=/some/folder` writes them
 * there instead of the lab, for trying settings. The masters are kept in
 * node_modules/.cache/sekvens/ (about 400 MB): `MASTERS=keep` encodes from
 * them again without drawing, to try another quality.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE = process.argv[2] ?? "http://127.0.0.1:4316";
const LAB = fileURLToPath(new URL("../lab/", import.meta.url));
const OUT = process.env.OUT ?? LAB;
const MASTERS = fileURLToPath(new URL("../node_modules/.cache/sekvens/", import.meta.url));
// Drawn at twice the master's size: the push in cuts the last picture from the middle of the frame, still larger than it is saved.
const SUPERSAMPLE = 2;
// The library's colours: ink, tint, metal, glow (as on its band and its film).
const COLOURS = ["#151922", "#4a5bb5", "#c9d9f0", "#879dc7"];
const FRAMES = 61;
const ONLY_FRAMES = process.env.FRAMES?.split(",").map(Number);
/** Masters drawn per visit to the tool page: they come back as one message, and a lossless picture is a megabyte or two. */
const BATCH = 6;

/**
 * The band's clock runs over the last third of the film's twelve-second loop (8 to 12 s, which is 0 again): the
 * pieces drift as they close up and the band turns 120° in its own plane, and the last picture is the film's first,
 * at the film's framing (zoom × push) and lean. So the sequence ends on the poster of the library's film, its top and
 * bottom edges faded into the ink of the section and the footer around it.
 */
const SHARED = { frames: FRAMES, supersample: SUPERSAMPLE, colours: COLOURS, from: 8, to: 12, loop: 12, tilt: 0.3, fade: [0.14, 0.08], quality: 1 };

/** What is saved from each master: its width, and libwebp's quality and effort (6 is the most). */
const SEQUENCES = [
  {
    name: "bred",
    folder: "public/sekvens/bred",
    width: 2400,
    height: 1350,
    zoom: 1.0,
    push: 1.55,
    outputs: [
      { format: "webp", width: 1600, every: 1, options: { quality: 80, effort: 6 } },
    ],
  },
  // Tall for phones, in a phone's own shape (19.5:9), so the band is never cut at the sides; the extra height is
  // backdrop, which costs almost nothing. Looser than the phone film: in a narrower frame the band is wider for its height.
  {
    name: "telefon",
    folder: "public/sekvens/telefon",
    width: 1080,
    height: 2340,
    zoom: 0.78,
    push: 0.98 / 0.78,
    outputs: [
      { format: "webp", width: 720, every: 1, options: { quality: 72, effort: 6 } },
    ],
  },
].map((sequence) => ({ ...SHARED, ...sequence }));

const master = (sequence, index) => join(MASTERS, sequence.name, `${String(index).padStart(3, "0")}.webp`);
const wanted = (sequence) => Array.from({ length: sequence.frames }, (_, index) => index).filter((index) => !ONLY_FRAMES || ONLY_FRAMES.includes(index));

/** Draws the masters on the tool page, a few at a time. */
async function draw(sequences) {
  const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", args: ["--enable-unsafe-swiftshader"] });
  for (const sequence of sequences) {
    const started = Date.now();
    rmSync(join(MASTERS, sequence.name), { recursive: true, force: true });
    mkdirSync(join(MASTERS, sequence.name), { recursive: true });
    // The band draws at twice the CSS size at most; the tool page makes its canvas large enough for the supersample.
    const page = await browser.newPage({ viewport: { width: 1700, height: 1400 }, deviceScaleFactor: 2 });
    page.on("console", (message) => message.type() === "error" && console.error(`  page: ${message.text()}`));
    await page.goto(`${BASE}/verktyg/film.html`, { waitUntil: "load" });
    await page.waitForFunction(() => window.filmReady === true, null, { timeout: 60_000 });
    const indexes = wanted(sequence);
    for (let at = 0; at < indexes.length; at += BATCH) {
      const only = indexes.slice(at, at + BATCH);
      const { files } = await page.evaluate((sequence) => window.renderSequence(sequence), { ...sequence, only });
      // The tool page names each picture by its index; here it is told apart by the order asked for.
      const data = Object.values(files);
      if (data.length !== only.length) throw new Error(`Asked for ${only.length} pictures, got ${data.length}`);
      only.forEach((index, i) => writeFileSync(master(sequence, index), Buffer.from(data[i], "base64")));
    }
    await page.close();
    console.log(`${sequence.name}: ${indexes.length} masters at ${sequence.width} × ${sequence.height}, ${Math.round((Date.now() - started) / 1000)} s`);
  }
  await browser.close();
}

/** Encodes one set from the masters, a few pictures at a time. */
async function encode(sequence, output) {
  const started = Date.now();
  const indexes = wanted(sequence).filter((index) => index % output.every === 0);
  const count = Math.floor((sequence.frames - 1) / output.every) + 1;
  const digits = String(count - 1).length;
  const folder = join(OUT, sequence.folder);
  mkdirSync(folder, { recursive: true });
  let bytes = 0;
  let next = 0;
  const work = async () => {
    while (next < indexes.length) {
      const index = indexes[next++];
      const from = master(sequence, index);
      if (!existsSync(from)) throw new Error(`No master ${from}: run without MASTERS=keep`);
      const picture = sharp(readFileSync(from));
      const { width } = await picture.metadata();
      if (width !== output.width) picture.resize({ width: output.width, kernel: "lanczos3" });
      const data = await picture[output.format](output.options).toBuffer();
      bytes += data.length;
      writeFileSync(join(folder, `${String(index / output.every).padStart(digits, "0")}.${output.format}`), data);
    }
  };
  await Promise.all(Array.from({ length: 4 }, work));
  const height = Math.round((output.width / sequence.width) * sequence.height);
  console.log(
    `${sequence.folder}: ${indexes.length} of ${count} ${output.format} at ${output.width} × ${height}, ${Math.round(bytes / 1024)} KB (${(bytes / 1024 / indexes.length).toFixed(1)} KB each), ${Math.round((Date.now() - started) / 1000)} s`,
  );
}

const sequences = SEQUENCES.filter((sequence) => !process.env.ONLY || sequence.name.includes(process.env.ONLY));
if (process.env.MASTERS !== "keep") await draw(sequences);
for (const sequence of sequences) {
  // A full render replaces the folder, so no picture of an earlier count is left behind.
  if (!ONLY_FRAMES && !process.env.OUT) rmSync(join(OUT, sequence.folder), { recursive: true, force: true });
  for (const output of sequence.outputs) if (!process.env.FORMAT || output.format === process.env.FORMAT) await encode(sequence, output);
}
