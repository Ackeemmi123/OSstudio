/**
 * Renders the lab's films to lab/film/ (AV1 in WebM, H.264 in MP4) and their
 * posters to lab/bilder/ (WebP), from the tool page lab/verktyg/film.html:
 * the engine's own 3D band, drawn frame by frame at twice the size and scaled
 * down, with its clock pinned to each frame so the loop closes exactly (one
 * turn, the flow and the sway all come round in the same eight seconds).
 * Encoded in Chrome itself with WebCodecs and packed with mp4-muxer and
 * webm-muxer, so nothing is installed beyond npm. The posters are the films'
 * first frame. Each film is played back in the page before it is saved: it
 * must last the whole loop and start in its poster's colours.
 *
 * Needs the dev server: `npm run dev`, then `node scripts/render-video.mjs`
 * (or pass its address: `node scripts/render-video.mjs http://127.0.0.1:4348`).
 * `ONLY=telefon` renders just the films whose name contains that. Uses the
 * installed Chrome, whose WebCodecs can encode H.264 (Playwright's Chromium
 * cannot); the H.264 encoder is the system's where there is one.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:4316";
const FPS = 30;
const SECONDS = 8;
// Drawn at twice the film's size, then scaled down: finer highlights on the satin than antialiasing alone gives.
const SUPERSAMPLE = 2;
// The lab's colours: ink, tint, metal, glow (as on the library's band).
const COLOURS = ["#151922", "#4a5bb5", "#c9d9f0", "#879dc7"];
const AV1 = "av01.0.05M.08";
const H264 = "avc1.64001f";

/** One film per shape of screen: wide for desktops and tablets, tall (720 wide) for phones. Each under 600 KB. */
const FILMS = [
  {
    name: "bandet-1280",
    width: 1280,
    height: 720,
    zoom: 1.4,
    encodings: [
      { file: "film/bandet-1280.webm", codec: AV1, bitrate: 520_000, hardware: "prefer-software" },
      { file: "film/bandet-1280.mp4", codec: H264, bitrate: 540_000, hardware: "no-preference" },
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
    zoom: 1.15,
    encodings: [
      { file: "film/bandet-telefon-720.webm", codec: AV1, bitrate: 520_000, hardware: "prefer-software" },
      { file: "film/bandet-telefon-720.mp4", codec: H264, bitrate: 540_000, hardware: "no-preference" },
    ],
    posters: [{ file: "bilder/bandet-film-telefon.webp", width: 720, quality: 0.86 }],
  },
];

const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", args: ["--enable-unsafe-swiftshader"] });
mkdirSync(new URL("../lab/film/", import.meta.url), { recursive: true });

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
    writeFileSync(new URL(`../lab/${file}`, import.meta.url), bytes);
    console.log(`${file.padEnd(32)} ${Math.round(bytes.length / 1024)} KB`);
  }
  console.log(`${film.name}: ${Math.round((Date.now() - started) / 1000)} s`);
  await page.close();
}
await browser.close();
