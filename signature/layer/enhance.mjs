/**
 * The Signature layer's enhancer: a finished static site in, the same site
 * with the layer attached out. A pure function over files in memory: no
 * filesystem, no network, nothing from Node. Studio OS calls it from its
 * site build; `scripts/enhance.mjs` is the same function behind a command.
 *
 * What it changes in the site: three tags before `</head>` in every HTML
 * file (the stylesheet, a preload, the module script). Plain string
 * operations on the head; the body is never read or written. Everything
 * else is done in the browser, before the first paint (see
 * `src/layer/index.ts`), so a site's HTML stays the site's.
 *
 * What it adds: the layer's built files (from `layer-dist/assets.mjs`, which
 * `npm run build:layer` writes and git keeps) and one `site.js` with this
 * site's map and preset.
 */
import { ASSETS, VERSION } from "../layer-dist/assets.mjs";
import association, { ASSOCIATION_PRESET } from "./maps/association.mjs";
import services, { DIRECTION_PRESETS } from "./maps/services.mjs";

export { ASSOCIATION_PRESET, DIRECTION_PRESETS, VERSION };

export const PRESET_NAMES = ["calm", "warm", "editorial", "bold"];
export const MODULE_NAMES = ["headline", "rise", "reveal", "stack", "cta", "list", "count"];

/** The maps that ship with the layer, by name. */
export const MAPS = { services, association };

/** The preset a Website Factory direction gets by default (`formal` → `calm`, …); `calm` for anything unknown. */
export function presetForDirection(direction) {
  return DIRECTION_PRESETS[direction] ?? "calm";
}

const START = "<!-- signature-layer";
const END = "<!-- /signature-layer -->";
const BLOCK = /[ \t]*<!-- signature-layer[\s\S]*?<!-- \/signature-layer -->\n?/g;

const attribute = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** From a page's own folder up to the site's top: "./" for index.html, "../" for about/index.html. */
function relativeRoot(path) {
  const depth = path.split("/").filter(Boolean).length - 1;
  return depth ? "../".repeat(depth) : "./";
}

function checkMap(map) {
  if (!map || typeof map !== "object" || !Array.isArray(map.rules)) throw new Error("Signature layer: a map needs a list of rules.");
  for (const rule of map.rules) {
    if (!MODULE_NAMES.includes(rule.module)) throw new Error(`Signature layer: no module called ${rule.module}. Known: ${MODULE_NAMES.join(", ")}.`);
    if (typeof rule.select !== "string" || !rule.select.trim()) throw new Error(`Signature layer: a ${rule.module} rule has no selector.`);
  }
  for (const entry of map.presets ?? []) {
    if (!PRESET_NAMES.includes(entry.preset) || typeof entry.when !== "string") throw new Error("Signature layer: each entry of a map's presets needs a selector (when) and a preset.");
  }
}

/**
 * @param {{ path: string, text: string }[]} files The site's files. Only `.html` files are read.
 * @param {{ preset: "calm" | "warm" | "editorial" | "bold" | "auto", map: "services" | "association" | object, root?: string, dir?: string }} options
 *   preset: a preset, or "auto" for the map's own choice per page (for `services`, by direction; for `association`, always calm).
 *   map: a shipped map's name, or a map object (`{ rules, presets?, tokens? }`).
 *   root: the prefix for the injected addresses. Left out, each page gets the relative way to the site's top
 *         ("./", "../"), as Website Factory writes its own `site.css` link. Pass "/" or "/some/folder/" for absolute ones.
 *   dir: the folder the layer's files go in, under the site's top. Default "signature".
 * @returns {{ files: { path: string, text: string }[], assets: { path: string, text: string, contentType: string }[], version: string }}
 *   files: the HTML files that changed, whole. assets: the files to add. Nothing else in the site changes.
 */
export function enhanceSite(files, options) {
  const { preset, root } = options;
  const map = typeof options.map === "string" ? MAPS[options.map] : options.map;
  if (typeof options.map === "string" && !map) throw new Error(`Signature layer: no map called ${options.map}. Known: ${Object.keys(MAPS).join(", ")}.`);
  checkMap(map);
  if (preset !== "auto" && !PRESET_NAMES.includes(preset)) throw new Error(`Signature layer: no preset called ${preset}. Known: ${PRESET_NAMES.join(", ")}, auto.`);
  if (preset === "auto" && !map.presets?.length) throw new Error("Signature layer: preset auto needs a map that says which preset a page gets (presets).");
  const dir = (options.dir ?? "signature").replace(/^\/+|\/+$/g, "");
  const prefix = root === undefined ? null : root.endsWith("/") ? root : `${root}/`;

  const changed = [];
  for (const file of files) {
    if (!/\.html?$/i.test(file.path)) continue;
    const text = file.text.replace(BLOCK, "");
    const at = text.search(/<\/head\s*>/i);
    if (at < 0) continue;
    const base = attribute(`${prefix ?? relativeRoot(file.path)}${dir}/`);
    const tags = [
      `${START} ${VERSION} -->`,
      `<link rel="stylesheet" href="${base}layer.css">`,
      `<link rel="modulepreload" href="${base}layer.js">`,
      `<script type="module" src="${base}site.js" blocking="render"></script>`,
      END,
      "",
    ].join("\n");
    changed.push({ path: file.path, text: text.slice(0, at) + tags + text.slice(at) });
  }

  const config = { preset, presets: preset === "auto" ? map.presets : undefined, rules: map.rules, tokens: map.tokens };
  // JSON is JavaScript, except that "<" could end a script when a host inlines the file: escaped, it cannot.
  const site = `import{start}from"./layer.js";start(${JSON.stringify(config).replace(/</g, "\\u003c")});\n`;
  const assets = [...ASSETS.map((asset) => ({ path: `${dir}/${asset.name}`, text: asset.text, contentType: asset.contentType })), { path: `${dir}/site.js`, text: site, contentType: "text/javascript; charset=utf-8" }];
  return { files: changed, assets, version: VERSION };
}
