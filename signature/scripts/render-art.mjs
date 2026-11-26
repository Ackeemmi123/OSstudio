/**
 * Renders the lab's artworks to lab/bilder/*.webp from the tool page
 * (lab/verktyg/), using the engine's own ink field and glass ring.
 * Each is written at full size and 800 pixels wide, for `srcset`.
 * Needs the dev server: `npm run dev`, then `node scripts/render-art.mjs`.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.argv[2] ?? "http://127.0.0.1:4316";
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", args: ["--enable-unsafe-swiftshader"] });
// Tall enough that every frame is on screen: fields draw only while visible.
const page = await browser.newPage({ viewport: { width: 1100, height: 5600 }, deviceScaleFactor: 2 });
await page.goto(`${BASE}/verktyg/`, { waitUntil: "load" });
await page.waitForFunction(() => window.artReady?.(), null, { timeout: 60_000 });
await page.waitForTimeout(1200);

// `ONLY=siden` renders just the frames whose name starts with that.
for (const frame of await page.locator("[data-art]").all()) {
  const name = await frame.getAttribute("data-art");
  if (process.env.ONLY && !name.startsWith(process.env.ONLY)) continue;
  const kind = await frame.getAttribute("data-kind");
  let webp;
  if (kind === "ring") {
    webp = await frame.locator("canvas").evaluate((canvas) => canvas.toDataURL("image/webp", 0.88));
  } else {
    // Shader fields keep no drawing buffer: take the element as the screen shows it, then encode in the browser.
    await frame.scrollIntoViewIfNeeded();
    const png = (await frame.screenshot()).toString("base64");
    webp = await page.evaluate(async (data) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      return canvas.toDataURL("image/webp", 0.86);
    }, png);
  }
  // The small version, scaled in halves first so fine lines stay sharp.
  const small = await page.evaluate(async (data) => {
    const image = new Image();
    image.src = data;
    await image.decode();
    let source = image;
    let width = image.naturalWidth;
    let height = image.naturalHeight;
    while (width / 2 >= 800) {
      const half = document.createElement("canvas");
      half.width = width = Math.round(width / 2);
      half.height = height = Math.round(height / 2);
      const context = half.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, width, height);
      source = half;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = Math.round((800 / image.naturalWidth) * image.naturalHeight);
    const context = canvas.getContext("2d");
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.84);
  }, webp);
  for (const [file, data] of [[`${name}.webp`, webp], [`${name}-800.webp`, small]]) {
    const bytes = Buffer.from(data.split(",")[1], "base64");
    writeFileSync(new URL(`../lab/bilder/${file}`, import.meta.url), bytes);
    console.log(`${file.padEnd(28)} ${Math.round(bytes.length / 1024)} KB`);
  }
}
await browser.close();
