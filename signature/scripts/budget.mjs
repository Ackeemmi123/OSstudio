/**
 * The weight budget, read from the built site: what every visitor downloads
 * for the first view, the motion engine that follows once the page has
 * loaded, and the shader that only WebGL visitors download. Fails the build when
 * anything is over. Compressed sizes, as they travel.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";

const DIST = new URL("../dist/", import.meta.url).pathname;

/** Limits in kilobytes. Initial = needed for the first view on every page. */
const BUDGET = {
  initialScript: 15,
  css: 15,
  html: 10,
  fonts: 140,
  motionEngine: 60,
  webglChunk: 10,
  threeD: 150,
};

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));

const all = files(DIST);
const html = all.filter((f) => f.endsWith(".html"));
const scripts = all.filter((f) => f.endsWith(".js"));
const webgl = scripts.filter((f) => /ink-field/.test(f));
const engine = scripts.filter((f) => /motion-modules/.test(f));
const threeD = scripts.filter((f) => /object-scene/.test(f));
const initial = scripts.filter((f) => !webgl.includes(f) && !engine.includes(f) && !threeD.includes(f));
const css = all.filter((f) => f.endsWith(".css"));
const fonts = all.filter((f) => f.endsWith(".woff2"));

// Fonts are already compressed: count their size as stored.
const sum = (list, measure = gz) => list.reduce((total, f) => total + measure(f), 0);
const rows = [
  ["Script, first view", kb(sum(initial)), BUDGET.initialScript],
  ["CSS", kb(sum(css)), BUDGET.css],
  ["HTML, largest page", kb(Math.max(...html.map(gz))), BUDGET.html],
  ["Fonts", kb(sum(fonts, (f) => statSync(f).size)), BUDGET.fonts],
  ["Motion engine, loaded later", kb(sum(engine)), BUDGET.motionEngine],
  ["WebGL chunk, loaded later", kb(sum(webgl)), BUDGET.webglChunk],
  ["3D (Three.js), only where used", kb(sum(threeD)), BUDGET.threeD],
];

let over = 0;
console.log("Weight budget (KB, compressed)\n");
for (const [label, size, limit] of rows) {
  const ok = size <= limit;
  if (!ok) over++;
  console.log(`${ok ? "ok  " : "OVER"}  ${label.padEnd(28)} ${String(size).padStart(7)} / ${limit}`);
}
console.log(`\nFiles: ${all.map((f) => relative(DIST, f)).length}`);
if (over) {
  console.error(`\n${over} over budget.`);
  process.exit(1);
}
