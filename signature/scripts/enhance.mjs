/**
 * Adds the Signature layer to a built static site. A thin wrapper around
 * `enhanceSite` (layer/enhance.mjs), which does the work on files in memory.
 *
 *   node scripts/enhance.mjs <builtSiteDir> --map services --preset auto
 *   node scripts/enhance.mjs <builtSiteDir> --map ./my-site.map.json --preset editorial --out <otherDir>
 *
 *   --map     a shipped map (services, association) or a JSON file with a map of the site's own selectors
 *   --preset  calm, warm, editorial, bold, or auto (the map decides per page; for services, by direction; for association, calm)
 *   --out     write the enhanced site to another folder (a copy) instead of changing it in place
 *   --root    prefix for the injected addresses, for example "/"; default: relative to each page
 *   --dir     the folder the layer's files go in; default "signature"
 *
 * In the site it adds three tags to each HTML file's head and one folder of
 * files. Running it again replaces what it added before.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { enhanceSite, MAPS } from "../layer/enhance.mjs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at < 0 ? fallback : args[at + 1];
};
const source = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
if (!source || !statSync(source, { throwIfNoEntry: false })?.isDirectory()) {
  console.error("Usage: node scripts/enhance.mjs <builtSiteDir> --map services --preset auto [--out <dir>] [--root /] [--dir signature]");
  process.exit(1);
}
const mapName = flag("map", "services");
const map = MAPS[mapName] ? mapName : JSON.parse(readFileSync(resolve(mapName), "utf8"));
const out = flag("out") ? resolve(flag("out")) : source;
const dir = flag("dir", "signature");

if (out !== source) {
  rmSync(out, { recursive: true, force: true });
  cpSync(source, out, { recursive: true });
}
const walk = (folder) => readdirSync(folder).flatMap((name) => (statSync(join(folder, name)).isDirectory() ? walk(join(folder, name)) : [join(folder, name)]));
const files = walk(out)
  .filter((file) => /\.html?$/i.test(file))
  .map((file) => ({ path: relative(out, file).split(sep).join("/"), text: readFileSync(file, "utf8") }));

const result = enhanceSite(files, { map, preset: flag("preset", "auto"), root: flag("root"), dir });
// The layer's folder is the layer's alone: what an earlier run left there goes.
rmSync(join(out, dir), { recursive: true, force: true });
for (const file of [...result.files, ...result.assets]) {
  mkdirSync(dirname(join(out, file.path)), { recursive: true });
  writeFileSync(join(out, file.path), file.text);
}
console.log(`Signature layer ${result.version}: ${result.files.length} of ${files.length} pages, ${result.assets.length} files in ${relative(process.cwd(), join(out, dir)) || dir}/ (map ${typeof map === "string" ? map : mapName}, preset ${flag("preset", "auto")}).`);
