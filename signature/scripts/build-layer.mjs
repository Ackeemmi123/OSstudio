/**
 * Builds the Signature layer (`src/layer/`) into `layer-dist/`, which git
 * keeps, so that Studio OS and the enhancer can use it without running Vite:
 *
 *   layer-dist/assets.mjs     every built file as text, under a stable name
 *   layer-dist/assets.d.mts   its types
 *   layer-dist/manifest.json  what was built from what, and how much it weighs
 *
 *   npm run build:layer            build
 *   npm run build:layer -- --check fail if the kept build is older than its source
 *
 * The check compares a hash of the source (every module that went into the
 * bundle, the stylesheets, this script and the versions of GSAP, Lenis and
 * Vite) with the one in the manifest, and each built file with its own hash. It builds nothing, so it gives the same
 * answer on every machine. `tests/layer-dist.spec.ts` runs it.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const HERE = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(HERE, "layer-dist");
const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

const sha = (text) => createHash("sha256").update(text).digest("hex");
const walk = (dir) => readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]));
const read = (file) => readFileSync(file, "utf8").replace(/\r\n/g, "\n");

/** Stylesheets are not modules of the bundle, so they are always counted: the layer's own and the engine parts it imports. */
const STYLES = ["src/layer/layer.css", ...readdirSync(join(HERE, "src/engine/parts")).map((name) => `src/engine/parts/${name}`)];

/** One hash over everything the build is made from: the given source files, the stylesheets, this script, and the versions of what is bundled. */
function sourceHash(inputs) {
  const pkg = JSON.parse(read(join(HERE, "package.json")));
  const versions = { gsap: pkg.dependencies.gsap, lenis: pkg.dependencies.lenis, vite: pkg.devDependencies.vite };
  const files = [...new Set([...inputs, ...STYLES, "scripts/build-layer.mjs"])].sort();
  return sha(JSON.stringify(versions) + files.map((file) => `${file}\n${existsSync(join(HERE, file)) ? sha(read(join(HERE, file))) : "missing"}`).join("\n"));
}

if (process.argv.includes("--check")) {
  const problems = [];
  let manifest;
  try {
    manifest = JSON.parse(read(join(OUT, "manifest.json")));
  } catch {
    problems.push("layer-dist/manifest.json is missing.");
  }
  if (manifest) {
    if (manifest.source !== sourceHash(manifest.inputs)) problems.push("The source of the layer has changed since layer-dist/ was built.");
    const { ASSETS, VERSION } = await import(new URL("../layer-dist/assets.mjs", import.meta.url).href);
    if (VERSION !== manifest.version) problems.push("layer-dist/assets.mjs and manifest.json are from different builds.");
    for (const entry of manifest.files) {
      const asset = ASSETS.find((item) => item.name === entry.name);
      if (!asset || sha(asset.text) !== entry.sha256) problems.push(`layer-dist/assets.mjs: ${entry.name} is not what the manifest says was built.`);
    }
    if (ASSETS.length !== manifest.files.length) problems.push("layer-dist/assets.mjs has other files than the manifest.");
  }
  if (problems.length) {
    console.error(`${problems.join("\n")}\nRun: npm run build:layer (in signature/), and commit layer-dist/.`);
    process.exit(1);
  }
  console.log(`layer-dist/ is current (${manifest.version}).`);
  process.exit(0);
}

const { build } = await import("vite");
const temp = mkdtempSync(join(tmpdir(), "signature-layer-"));
// Which of this folder's files went into the bundle: the check watches exactly these.
const inputs = new Set();
const record = {
  name: "signature-layer-inputs",
  generateBundle(_, bundle) {
    for (const chunk of Object.values(bundle)) {
      for (const id of Object.keys(chunk.modules ?? {})) {
        const file = id.split("?")[0];
        if (file.startsWith(HERE) && !file.includes("node_modules") && !file.endsWith(".css")) inputs.add(relative(HERE, file).split(sep).join("/"));
      }
    }
  },
};
try {
  await build({
    configFile: false,
    root: HERE,
    base: "./",
    publicDir: false,
    logLevel: "warn",
    plugins: [record],
    build: {
      outDir: temp,
      emptyOutDir: true,
      target: "es2022",
      // One stylesheet for the whole layer, and no helper that preloads chunks: each chunk is fetched when its module is needed.
      cssCodeSplit: false,
      modulePreload: false,
      rolldownOptions: {
        input: { layer: join(HERE, "src/layer/index.ts") },
        // `strict`: the entry keeps its `start` export for site.js. Stable names: the files are addressed by name.
        preserveEntrySignatures: "strict",
        output: { format: "es", entryFileNames: "[name].js", chunkFileNames: "[name].js", assetFileNames: "layer[extname]" },
      },
    },
  });

  const built = walk(temp)
    .map((file) => ({ name: relative(temp, file).split(sep).join("/"), text: read(file) }))
    .filter((file) => /\.(js|css)$/.test(file.name))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  if (!built.some((file) => file.name === "layer.js") || !built.some((file) => file.name === "layer.css")) throw new Error(`The build did not write layer.js and layer.css: ${built.map((file) => file.name).join(", ")}`);

  const kept = [...inputs].sort();
  if (!kept.includes("src/layer/index.ts")) throw new Error("The build did not report its modules.");
  const source = sourceHash(kept);
  const version = sha(built.map((file) => file.name + sha(file.text)).join("")).slice(0, 10);
  const files = built.map((file) => ({ name: file.name, bytes: Buffer.byteLength(file.text), gzip: gzipSync(file.text, { level: 9 }).length, sha256: sha(file.text) }));

  mkdirSync(OUT, { recursive: true });
  const body = built.map((file) => `  { name: ${JSON.stringify(file.name)}, contentType: ${JSON.stringify(TYPES[file.name.slice(file.name.lastIndexOf("."))])}, text: ${JSON.stringify(file.text)} },`).join("\n");
  writeFileSync(
    join(OUT, "assets.mjs"),
    `/* eslint-disable */\n// Generated by scripts/build-layer.mjs from src/layer/. Do not edit: run \`npm run build:layer\`.\n// The Signature layer's built files as text, so that the enhancer needs no filesystem.\nexport const VERSION = ${JSON.stringify(version)};\nexport const ASSETS = [\n${body}\n];\n`,
  );
  writeFileSync(join(OUT, "assets.d.mts"), `// Generated by scripts/build-layer.mjs.\nexport declare const VERSION: string;\nexport declare const ASSETS: { name: string; contentType: string; text: string }[];\n`);
  writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify({ version, source, inputs: kept, files }, null, 2)}\n`);

  console.log(`Signature layer ${version}\n`);
  for (const file of files) console.log(`${file.name.padEnd(22)} ${String(file.bytes).padStart(7)} B  ${(file.gzip / 1024).toFixed(2).padStart(6)} KB gzip`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
