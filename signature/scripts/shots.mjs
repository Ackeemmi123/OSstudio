/**
 * Screenshots of the built lab for a person to look at: desktop and phone,
 * with motion and with reduced motion, with the ink field running on
 * software WebGL (`?webgl`). Usage: node scripts/shots.mjs <out-dir> [base-url]
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const out = process.argv[2] ?? "shots";
const base = process.argv[3] ?? "http://127.0.0.1:4317";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", args: ["--enable-unsafe-swiftshader"] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

for (const [name, viewport, scale] of [["desktop", { width: 1440, height: 900 }, 1], ["phone", { width: 390, height: 844 }, 2]]) {
  for (const motion of ["no-preference", "reduce"]) {
    const page = await browser.newPage({ viewport, deviceScaleFactor: scale, reducedMotion: motion });
    await page.goto(`${base}/?webgl`, { waitUntil: "load" });
    await wait(3500);
    await page.screenshot({ path: `${out}/${name}-${motion}-hero.png` });
    const full = name === "desktop";
    for (const [i, selector] of [".intro", ".scene", ".modes", ".next"].entries()) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ block: "start" }), selector);
      await wait(1600);
      await page.screenshot({ path: `${out}/${name}-${motion}-${i + 1}${selector.slice(1)}.png`, fullPage: false });
      if (!full) break;
    }
    await page.close();
  }
}
const two = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await two.goto(`${base}/scen/`, { waitUntil: "load" });
await wait(2200);
await two.screenshot({ path: `${out}/desktop-scen.png` });
await browser.close();
console.log("ok");
