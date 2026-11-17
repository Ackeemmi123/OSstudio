#!/usr/bin/env node
/**
 * Packs the three built sites into one private preview for showing on a phone.
 * Search engines are told to stay away, and forms are switched off, as nothing
 * receives them yet. Run `npm run proof:build` first, then deploy proof/out/preview.
 */
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "out");
const preview = path.join(out, "preview");
const SITES = [
  ["lindqvist", "Lindqvist Accounting"],
  ["kivela", "Asianajotoimisto Kivelä"],
  ["norrsken", "Norrsken VVS"],
];

function switchOffForms(dir) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) switchOffForms(file);
    else if (name.endsWith(".html")) writeFileSync(file, readFileSync(file, "utf8").replaceAll('type="submit"', 'type="submit" disabled'));
  }
}

rmSync(preview, { recursive: true, force: true });
for (const [name] of SITES) {
  if (!existsSync(path.join(out, name, "index.html"))) throw new Error(`Run npm run proof:build first: no ${name}.`);
  cpSync(path.join(out, name), path.join(preview, name), { recursive: true });
  switchOffForms(path.join(preview, name));
}
writeFileSync(path.join(preview, "robots.txt"), "User-agent: *\nDisallow: /\n");
writeFileSync(path.join(preview, "vercel.json"), JSON.stringify({ headers: [{ source: "/(.*)", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }] }, null, 2));
writeFileSync(
  path.join(preview, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Website examples</title><style>body{margin:0;background:#111;color:#f6f5ee;font:1.1rem/1.5 system-ui,sans-serif;padding:2rem 1.25rem;max-width:34rem}h1{font-size:1.6rem;margin:0 0 .4rem}p{margin:0 0 1.5rem;color:#c9cbc4}a{display:block;color:inherit;padding:1rem 0;border-top:1px solid #ffffff40;font-size:1.25rem}</style></head><body><h1>Website examples</h1><p>Three invented businesses. Nothing here is a real company.</p>${SITES.map(([name, title]) => `<a href="./${name}/">${title}</a>`).join("")}</body></html>\n`,
);
console.log(`Packed ${SITES.length} sites into ${preview}`);
