/**
 * Renders the lab's films to lab/film/ (AV1 in WebM, H.264 in MP4) and their
 * posters to lab/bilder/ (WebP), from the tool page lab/verktyg/film.html:
 * the engine's own 3D band, drawn frame by frame at twice the size and scaled
 * down, with its clock pinned to each frame so the loop closes exactly (one
 * turn, the flow and the sway all come round in the same twelve seconds).
 * Encoded in Chrome itself with WebCodecs and packed with Mediabunny, so
 * nothing is installed beyond npm. The posters are the films'
 * first frame. Each film is played back in the page before it is saved: it
 * must last the whole loop and start in its poster's colours.
 *
 * Needs the dev server: `npm run dev`, then `node scripts/render-video.mjs`
 * (or pass its address: `node scripts/render-video.mjs http://127.0.0.1:4348`).
 * `ONLY=telefon` renders just the films whose name contains that; `OUT=/some/folder`
 * writes there (film/ and bilder/ inside it) instead of over the lab's own files. Uses the
 * installed Chrome, whose WebCodecs can encode H.264 (Playwright's Chromium
 * cannot); the H.264 encoder is the system's where there is one.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:4316";
// Slow and cinematic: one turn in twelve seconds (30° a second), at 24 frames a second.
const FPS = 24;
const SECONDS = 12;
// Drawn at twice the film's size, then scaled down: finer highlights on the satin than antialiasing alone gives.
const SUPERSAMPLE = 2;
// The lab's colours: ink, tint, metal, glow (as on the library's band).
const COLOURS = ["#151922", "#4a5bb5", "#c9d9f0", "#879dc7"];
// Leaning further back than on the page, nearer edge-on: the inside of the band shows its satin, and the
// backdrop seen through the loop stays a sliver, so the band reads as a ribbon all the way round.
const TILT = 0.3;
// AV1 main profile, and H.264 high profile, at the levels each size needs (3.1 up to 720p, 4.0 for 1080p).
const AV1 = "av01.0.05M.08";
const H264 = "avc1.64001f";

/** One film per shape of screen: wide for desktops and tablets, tall (720 wide) for phones. Each under 600 KB. */
const FILMS = [
  {
    name: "bandet-1280",
    width: 1280,
    height: 720,
    zoom: 1.55,
    encodings: [
      { file: "film/bandet-1280.webm", codec: AV1, bitrate: 360_000, hardware: "prefer-software" },
      { file: "film/bandet-1280.mp4", codec: H264, bitrate: 370_000, hardware: "no-preference" },
    ],
    posters: [
      { file: "bilder/bandet-film.webp", width: 1600, quality: 0.86 },
      { file: "bilder/bandet-film-800.webp", width: 800, quality: 0.84 },
    ],
  },
  {
    name: "bandet-telefon-720",
    width: 720,
    height: 1280,
    zoom: 1.3,
    encodings: [
      { file: "film/bandet-telefon-720.webm", codec: AV1, bitrate: 360_000, hardware: "prefer-software" },
      { file: "film/bandet-telefon-720.mp4", codec: H264, bitrate: 370_000, hardware: "no-preference" },
    ],
    posters: [{ file: "bilder/bandet-film-telefon.webp", width: 720, quality: 0.86 }],
  },
  {
    name: "bandet-1920",
    width: 1920,
    height: 1080,
    zoom: 1.55,
    encodings: [
      { file: "film/bandet-1920.webm", codec: "av01.0.08M.08", bitrate: 700_000, hardware: "prefer-software" },
      { file: "film/bandet-1920.mp4", codec: "avc1.640028", bitrate: 760_000, hardware: "no-preference" },
    ],
    posters: [],
  },
].map((film) => ({ ...film, tilt: TILT }));

const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", args: ["--enable-unsafe-swiftshader"] });
const OUT = process.env.OUT ? pathToFileURL(`${resolve(process.env.OUT)}/`) : new URL("../lab/", import.meta.url);
for (const folder of ["film/", "bilder/"]) mkdirSync(new URL(folder, OUT), { recursive: true });

for (const film of FILMS) {
  if (process.env.ONLY && !film.name.includes(process.env.ONLY)) continue;
  // The page's pixel ratio is the supersample: the band draws at twice the film's size.
  const page = await browser.newPage({ viewport: { width: 1600, height: 1400 }, deviceScaleFactor: SUPERSAMPLE });
  page.on("console", (message) => message.type() === "error" && console.error(`  page: ${message.text()}`));
  await page.goto(`${BASE}/verktyg/film.html`, { waitUntil: "load" });
  await page.waitForFunction(() => window.filmReady === true, null, { timeout: 60_000 });
  const started = Date.now();
  const { files, log } = await page.evaluate((film) => window.renderFilm(film), { ...film, fps: FPS, seconds: SECONDS, supersample: SUPERSAMPLE, colours: COLOURS });
  for (const line of log) console.log(`  ${line}`);
  for (const [file, data] of Object.entries(files)) {
    const bytes = Buffer.from(data, "base64");
    writeFileSync(new URL(file, OUT), bytes);
    console.log(`${file.padEnd(32)} ${Math.round(bytes.length / 1024)} KB`);
  }
  console.log(`${film.name}: ${Math.round((Date.now() - started) / 1000)} s`);
  await page.close();
}
await browser.close();
