#!/usr/bin/env node
/**
 * Does QA catch what it claims to? Plants one defect at a time in a copy of a
 * clean site, and expects that defect's check to fail. The clean site itself
 * must pass, so this also shows there are no false alarms.
 *
 *   npm run proof:build && npm run proof:qa:planted
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { runQa } from "./qa.mjs";

const built = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), "../out", name);
const clean = built("lindqvist");
if (!existsSync(clean)) {
  console.error("Run npm run proof:build first.");
  process.exit(1);
}

const home = (change) => (dir) => {
  const file = path.join(dir, "index.html");
  writeFileSync(file, change(readFileSync(file, "utf8")));
};
const once = (html, find, replace) => {
  if (!html.includes(find)) throw new Error(`Cannot plant: ${find}`);
  return html.replace(find, replace);
};

const DEFECTS = [
  ["image with no description", "image-alt", home((html) => html.replace(/alt="[^"]*"/, 'alt=""'))],
  ["image that does not load", "image-broken", home((html) => html.replace(/<img [^>]*>/, '<img src="./missing.jpg" alt="Missing" width="10" height="10">'))],
  ["link to a page that does not exist", "broken-link", home((html) => once(html, 'href="#questions"', 'href="./no-such-page/"'))],
  ["link to a place on the page that does not exist", "broken-anchor", home((html) => once(html, 'href="#questions"', 'href="#no-such-place"'))],
  ["element wider than the screen", "sideways-scroll", home((html) => once(html, '<main id="main">', '<main id="main"><div style="width:3000px;height:2px"></div>'))],
  ["text too faint to read", "accessibility:color-contrast", home((html) => once(html, '<p class="hero-why">', '<p class="hero-why" style="color:#d9d5ca">'))],
  ["a template's instruction left on the page", "leftover-text", home((html) => once(html, '<p class="hero-why">', '<p class="hero-why">[Say why this matters to them] '))],
  ["lorem ipsum", "leftover-text", home((html) => once(html, '<p class="hero-why">', '<p class="hero-why">Lorem ipsum dolor. '))],
  ["a claim the client has not confirmed", "unconfirmed-claim", home((html) => once(html, '<p class="hero-why">', '<p class="hero-why">Award-winning accountants. '))],
  ["a form field with no label", "accessibility:label", home((html) => html.replace(/<label for="home-email">[^<]*<\/label>/, ""))],
  ["a script from outside the site", "script", home((html) => once(html, "</head>", '<script src="https://tracker.example/t.js"></script></head>'))],
  ["two main headings", "headings", home((html) => once(html, '<main id="main">', '<main id="main"><h1>Another</h1>'))],
  ["a form with no spam trap", "form", home((html) => html.replace(/<div class="trap"[\s\S]*?<\/div>/, ""))],
  ["words left faint by an animation", "motion-hides-words", home((html) => once(html, "</head>", "<style>@keyframes faint{to{opacity:.1}}@media (prefers-reduced-motion:no-preference){main .ledger-row.ledger-row{animation:faint .1s forwards;animation-timeline:auto}}</style></head>"))],
  ["an animation that ignores reduced motion", "motion-not-off", home((html) => once(html, "</head>", "<style>@keyframes sway{to{translate:4px 0}}.hero-why{animation:sway 2s infinite}</style></head>"))],
  ["a phone number pushed below the first screen", "call-below-first-screen", home((html) => once(html, '<section class="hero hero--poster"', '<div style="height:1200px"></div><section class="hero hero--poster"')), "norrsken"],
];

const browser = await chromium.launch({ channel: "chrome" });
const widths = [390, 1440];
const base = await runQa(clean, { widths, browser });
console.log(base.failures.length ? `Clean site: ${base.failures.length} false alarms` : "Clean site: no false alarms");
for (const failure of base.failures) console.log(`      ${failure.check}  ${failure.where}  ${failure.detail}`);

let missed = 0;
for (const [name, check, plant, site = "lindqvist"] of DEFECTS) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "proof-planted-"));
  cpSync(built(site), dir, { recursive: true });
  plant(dir);
  const { failures } = await runQa(dir, { widths, browser });
  rmSync(dir, { recursive: true, force: true });
  const caught = failures.some((failure) => failure.check === check);
  if (!caught) missed += 1;
  console.log(`${caught ? "caught" : "MISSED"}  ${name}  (${check})${caught ? "" : `: got ${failures.map((f) => f.check).join(", ") || "nothing"}`}`);
}
await browser.close();
console.log(`${DEFECTS.length - missed} of ${DEFECTS.length} defects caught`);
process.exit(missed || base.failures.length ? 1 : 0);
