/**
 * Puts the Signature layer's test site into the built lab, where the test
 * server serves it (`npm run build` runs this last):
 *
 *   dist/layer-fixture/base/       the hand-built site as it is (tests/fixtures/layer-site)
 *   dist/layer-fixture/enhanced/   the same, enhanced with its own map, preset editorial (every module allowed)
 *   dist/layer-fixture/calm/       the same map, preset calm (reveals and headline rises only)
 *
 * Its pictures are the lab's, made in code (lab/bilder). The weight budget
 * leaves this folder out of the lab's numbers.
 */
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { enhanceSite } from "../layer/enhance.mjs";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const SOURCE = join(HERE, "tests/fixtures/layer-site");
const OUT = join(HERE, "dist/layer-fixture");
const PICTURES = ["siden-sand", "siden-skog", "siden-ockra", "siden-natt", "siden-terrakotta", "siden-lila"];

const walk = (folder) => readdirSync(folder).flatMap((name) => (statSync(join(folder, name)).isDirectory() ? walk(join(folder, name)) : [join(folder, name)]));
const map = JSON.parse(readFileSync(join(SOURCE, "signature.map.json"), "utf8"));
const pages = walk(SOURCE)
  .filter((file) => file.endsWith(".html"))
  .map((file) => ({ path: relative(SOURCE, file).split(sep).join("/"), text: readFileSync(file, "utf8") }));

rmSync(OUT, { recursive: true, force: true });
for (const [name, preset] of [["base", null], ["enhanced", "editorial"], ["calm", "calm"]]) {
  const out = join(OUT, name);
  cpSync(SOURCE, out, { recursive: true, filter: (file) => !file.endsWith("signature.map.json") });
  mkdirSync(join(out, "bilder"), { recursive: true });
  for (const picture of PICTURES) cpSync(join(HERE, "lab/bilder", `${picture}-800.webp`), join(out, "bilder", `${picture}-800.webp`));
  if (!preset) continue;
  const result = enhanceSite(pages, { map, preset });
  for (const file of [...result.files, ...result.assets]) {
    mkdirSync(dirname(join(out, file.path)), { recursive: true });
    writeFileSync(join(out, file.path), file.text);
  }
}
console.log(`Signature layer fixture: dist/layer-fixture/ (base, enhanced, calm), ${pages.length} pages each.`);
