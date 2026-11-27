/**
 * The weight budget, read from the built site: what every visitor downloads
 * for the first view, the motion engine that follows once the page has
 * loaded, and the shader that only WebGL visitors download (in a worker or
 * on the main thread, never both). Fails the build when
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
  threeD: 10,
  sound: 3,
  video: 3,
  largestImage: 100,
  largestFilm: 600,
};

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));

const all = files(DIST);
const html = all.filter((f) => f.endsWith(".html"));
const scripts = all.filter((f) => f.endsWith(".js"));
// The shader stage and its noise are shared by the ink field and the image effect: loaded later, with them.
const webgl = scripts.filter((f) => /ink-field|noise|shader-stage/.test(f));
const sound = scripts.filter((f) => /sound/.test(f));
const video = scripts.filter((f) => /\/video-[^/]*\.js$/.test(f));
const engine = scripts.filter((f) => /motion-modules/.test(f));
const threeD = scripts.filter((f) => /band-scene/.test(f));
// A scene that can draw off the main thread comes in two forms, and a visitor downloads one: the worker where the
// browser can draw WebGL in one, otherwise the same drawing for the main thread. The larger of the two is counted.
const stageWorker = scripts.filter((f) => /stage-worker/.test(f));
const stageMain = scripts.filter((f) => /stage-core/.test(f));
const bandWorker = scripts.filter((f) => /band-worker/.test(f));
const bandMain = scripts.filter((f) => /band-core/.test(f));
const initial = scripts.filter((f) => ![webgl, engine, threeD, sound, video, stageWorker, stageMain, bandWorker, bandMain].some((group) => group.includes(f)));
const css = all.filter((f) => f.endsWith(".css"));
const fonts = all.filter((f) => f.endsWith(".woff2"));
const images = all.filter((f) => /\.(webp|avif|jpe?g|png)$/.test(f));
const films = all.filter((f) => /\.(webm|mp4)$/.test(f));

// Fonts are already compressed: count their size as stored.
const sum = (list, measure = gz) => list.reduce((total, f) => total + measure(f), 0);
const rows = [
  ["Script, first view", kb(sum(initial)), BUDGET.initialScript],
  ["CSS", kb(sum(css)), BUDGET.css],
  ["HTML, largest page", kb(Math.max(...html.map(gz))), BUDGET.html],
  ["Fonts", kb(sum(fonts, (f) => statSync(f).size)), BUDGET.fonts],
  ["Motion engine, loaded later", kb(sum(engine)), BUDGET.motionEngine],
  ["WebGL chunk, loaded later", kb(sum(webgl) + Math.max(sum(stageWorker), sum(stageMain))), BUDGET.webglChunk],
  ["3D band, only where used", kb(sum(threeD) + Math.max(sum(bandWorker), sum(bandMain))), BUDGET.threeD],
  ["Sound, after load, if used", kb(sum(sound)), BUDGET.sound],
  ["Video, only where used", kb(sum(video)), BUDGET.video],
  // Images are already compressed; each one is fetched only when it comes near, at the size the screen needs.
  ["Largest single image", kb(Math.max(0, ...images.map((f) => statSync(f).size))), BUDGET.largestImage],
  // Films, as stored: each is fetched only as it comes near, never with Save-Data, and only the one the screen needs.
  ["Largest single film", kb(Math.max(0, ...films.map((f) => statSync(f).size))), BUDGET.largestFilm],
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
