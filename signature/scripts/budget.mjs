/**
 * The weight budget, read from the built site: what every visitor downloads
 * for the first view, the motion engine that follows once the page has
 * loaded, and the shader that only WebGL visitors download (in a worker or
 * on the main thread, never both). Fails the build when
 * anything is over. Compressed sizes, as they travel.
 *
 * The Signature layer (the motion a finished site gets, `src/layer/`) has
 * its own lines, read from its kept build (`layer-dist/`): what an enhanced
 * site loads for the first view, and each chunk that follows only on pages
 * that use it. The layer's test site in `dist/layer-fixture/` is not part of
 * the lab and is left out of the lab's lines.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync } from "node:zlib";
import { enhanceSite } from "../layer/enhance.mjs";

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
  sequence: 3,
  largestImage: 100,
  largestFilm: 600,
  largestFullHdFilm: 1200,
  // The Signature layer, on an enhanced site.
  layerScript: 6,
  layerCss: 2.5,
  layerSmooth: 6,
  layerCta: 2,
  layerCount: 1,
  layerList: 50,
  // An image sequence's frames, all of them, for one screen shape: a visitor fetches one set, never both. The phone's
  // are in a phone's own shape (720 × 1560, 19.5:9), so the band is never cut at the sides, and their edges fade into
  // the page: about 3 % over 600 KB at the quality where the satin keeps its brushed streaks (measured 618).
  sequenceWide: 1200,
  sequencePhone: 640,
};

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const gz = (file) => gzipSync(readFileSync(file), { level: 9 }).length;
const files = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]));

const all = files(DIST).filter((f) => !relative(DIST, f).startsWith("layer-fixture"));
const html = all.filter((f) => f.endsWith(".html"));
const scripts = all.filter((f) => f.endsWith(".js"));
// The shader stage and its noise are shared by the ink field and the image effect: loaded later, with them.
const webgl = scripts.filter((f) => /ink-field|noise|shader-stage/.test(f));
const sound = scripts.filter((f) => /sound/.test(f));
const video = scripts.filter((f) => /\/video-[^/]*\.js$/.test(f));
// An image sequence's frames are fetched and decoded in a worker, or by the same code on the main thread where a worker
// cannot start: a visitor downloads the module and one of the two, so the larger is counted.
const sequenceWorker = scripts.filter((f) => /\/sequence-worker-[^/]*\.js$/.test(f));
const sequenceHere = scripts.filter((f) => /\/sequence-loader-[^/]*\.js$/.test(f));
const sequence = scripts.filter((f) => /\/sequence-[^/]*\.js$/.test(f) && ![...sequenceWorker, ...sequenceHere].includes(f));
const engine = scripts.filter((f) => /motion-modules/.test(f));
const threeD = scripts.filter((f) => /band-scene/.test(f));
// A scene that can draw off the main thread comes in two forms, and a visitor downloads one: the worker where the
// browser can draw WebGL in one, otherwise the same drawing for the main thread. The larger of the two is counted.
const stageWorker = scripts.filter((f) => /stage-worker/.test(f));
const stageMain = scripts.filter((f) => /stage-core/.test(f));
const bandWorker = scripts.filter((f) => /band-worker/.test(f));
const bandMain = scripts.filter((f) => /band-core/.test(f));
const initial = scripts.filter((f) => ![webgl, engine, threeD, sound, video, sequence, sequenceWorker, sequenceHere, stageWorker, stageMain, bandWorker, bandMain].some((group) => group.includes(f)));
const css = all.filter((f) => f.endsWith(".css"));
const fonts = all.filter((f) => f.endsWith(".woff2"));
const images = all.filter((f) => /\.(webp|avif|jpe?g|png)$/.test(f));
// Films: full HD ones (for wide screens only) have a budget of their own.
const films = all.filter((f) => /\.(webm|mp4)$/.test(f));
const fullHd = films.filter((f) => /-1920[-.]/.test(f));
const smaller = films.filter((f) => !fullHd.includes(f));
// Image sequences (lab/public/sekvens/): the wide frames and the tall ones for phones.
const frames = (shape) => images.filter((f) => new RegExp(`/sekvens/${shape}/`).test(f));

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
  ["Sequence, only where used", kb(sum(sequence) + Math.max(sum(sequenceWorker), sum(sequenceHere))), BUDGET.sequence],
  // Images are already compressed; each one is fetched only when it comes near, at the size the screen needs.
  ["Largest single image", kb(Math.max(0, ...images.map((f) => statSync(f).size))), BUDGET.largestImage],
  // Films, as stored: each is fetched only as it comes near, never with Save-Data, and only the one the screen needs.
  ["Largest single film", kb(Math.max(0, ...smaller.map((f) => statSync(f).size))), BUDGET.largestFilm],
  ["Largest film, full HD", kb(Math.max(0, ...fullHd.map((f) => statSync(f).size))), BUDGET.largestFullHdFilm],
  // Frames, as stored: fetched a screen ahead of the sequence, one set per screen shape, never with Save-Data.
  ["Sequence frames, wide", kb(sum(frames("bred"), (f) => statSync(f).size)), BUDGET.sequenceWide],
  ["Sequence frames, phone", kb(sum(frames("telefon"), (f) => statSync(f).size)), BUDGET.sequencePhone],
];

// The layer, as the enhancer hands it to a site: its entry and the site's own map (here Website Factory's, the largest) are
// the whole first view; the rest are chunks fetched when a page's map and preset use them.
const layer = enhanceSite([], { map: "services", preset: "auto" }).assets;
const layerSize = (...names) => layer.filter((asset) => names.includes(asset.path.split("/").pop())).reduce((total, asset) => total + gzipSync(asset.text, { level: 9 }).length, 0);
const known = ["layer.js", "site.js", "layer.css", "smooth.js", "cta.js", "count.js", "list.js"];
const unknown = layer.map((asset) => asset.path.split("/").pop()).filter((name) => !known.includes(name));
if (unknown.length) {
  console.error(`The layer has files without a budget line: ${unknown.join(", ")}. Add them in scripts/budget.mjs.`);
  process.exit(1);
}
rows.push(
  ["Layer: script, first view", kb(layerSize("layer.js", "site.js")), BUDGET.layerScript],
  ["Layer: CSS", kb(layerSize("layer.css")), BUDGET.layerCss],
  ["Layer: smooth scroll, on scroll", kb(layerSize("smooth.js")), BUDGET.layerSmooth],
  ["Layer: call to action, later", kb(layerSize("cta.js")), BUDGET.layerCta],
  ["Layer: count, where used", kb(layerSize("count.js")), BUDGET.layerCount],
  ["Layer: hover list, mouse only", kb(layerSize("list.js")), BUDGET.layerList],
);

let over = 0;
console.log("Weight budget (KB, compressed)\n");
for (const [label, size, limit] of rows) {
  const ok = size <= limit;
  if (!ok) over++;
  console.log(`${ok ? "ok  " : "OVER"}  ${label.padEnd(32)} ${String(size).padStart(7)} / ${limit}`);
}
console.log(`\nFiles: ${all.map((f) => relative(DIST, f)).length}`);
if (over) {
  console.error(`\n${over} over budget.`);
  process.exit(1);
}
