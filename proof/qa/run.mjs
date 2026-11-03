#!/usr/bin/env node
/**
 * QA of the built sites, with a report per site in proof/out/reports.
 *
 *   npm run proof:build
 *   npm run proof:qa            # every site
 *   npm run proof:qa lindqvist  # one site
 *
 * Exits with 1 if any site fails.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { runQa, WIDTHS } from "./qa.mjs";

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), "../out");
if (!existsSync(out)) {
  console.error("Nothing built yet. Run npm run proof:build first.");
  process.exit(1);
}
const reports = path.join(out, "reports");
const names = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(out).filter((name) => existsSync(path.join(out, name, "index.html")));
const escape = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const browser = await chromium.launch({ channel: "chrome" });
let failed = false;
for (const name of names) {
  const factsFile = path.join(out, `${name}.facts.json`);
  const confirmedFacts = existsSync(factsFile) ? JSON.parse(readFileSync(factsFile, "utf8")) : [];
  const shotsTo = path.join(reports, name);
  mkdirSync(shotsTo, { recursive: true });
  const { failures, measures } = await runQa(path.join(out, name), { confirmedFacts, shotsTo, browser });
  failed ||= failures.length > 0;
  writeFileSync(path.join(reports, `${name}.json`), JSON.stringify({ name, widths: WIDTHS, measures, failures }, null, 2));
  const shots = readdirSync(shotsTo).filter((file) => file.endsWith(".jpg")).sort();
  writeFileSync(
    path.join(reports, `${name}.html`),
    `<!doctype html><meta charset="utf-8"><title>QA: ${escape(name)}</title><style>body{font:15px/1.5 system-ui;margin:2rem;max-width:80rem}td,th{border-bottom:1px solid #ccc;padding:.3rem .6rem;text-align:left}img{width:220px;border:1px solid #ccc;margin:.25rem;vertical-align:top}</style><h1>${escape(name)}: ${failures.length ? `${failures.length} failed` : "passed"}</h1><p>${measures.pages} pages at ${WIDTHS.join(", ")} px. Largest page without photos: ${Math.round(measures.largestWithoutImages / 1000)} KB.</p>${failures.length ? `<table><tr><th>Check</th><th>Where</th><th>Detail</th></tr>${failures.map((f) => `<tr><td>${escape(f.check)}</td><td>${escape(f.where)}</td><td>${escape(f.detail)}</td></tr>`).join("")}</table>` : ""}<p>${shots.map((shot) => `<a href="${name}/${shot}"><img src="${name}/${shot}" alt="${shot}" loading="lazy"></a>`).join("")}</p>`,
  );
  console.log(`${failures.length ? "FAIL" : "pass"}  ${name}  (${measures.pages} pages, ${Math.round(measures.largestWithoutImages / 1000)} KB without photos)`);
  for (const failure of failures.slice(0, 12)) console.log(`      ${failure.check}  ${failure.where}  ${failure.detail}`);
  if (failures.length > 12) console.log(`      and ${failures.length - 12} more`);
}
await browser.close();
process.exit(failed ? 1 : 0);
