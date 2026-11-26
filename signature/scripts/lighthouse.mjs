/**
 * Lighthouse on a simulated mid-range phone, for every page of the built lab.
 * Each page is measured three times and judged on the median run, as
 * Lighthouse CI recommends: single runs vary with the machine's load. Fails
 * when the median scores under the gate. Uses a running preview server, or
 * starts one.
 */
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const PORT = 4317;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGES = (process.env.LH_PAGES ?? "/,/scen/,/bibliotek/,/visning/,/404.html").split(",");
const GATE = { performance: 0.95, accessibility: 1, "best-practices": 0.95, seo: 0.9 };
// Pages kept out of search on purpose. Their SEO is judged on everything except
// being indexable, and they must really say noindex.
const NOT_INDEXED = new Set(["/404.html"]);

/** The SEO score without the indexability audit, weighted as Lighthouse weights it. */
function seoWithoutIndexing(lhr) {
  const refs = lhr.categories.seo.auditRefs.filter((ref) => ref.weight > 0 && ref.id !== "is-crawlable" && lhr.audits[ref.id].score !== null);
  const weight = refs.reduce((total, ref) => total + ref.weight, 0);
  return weight ? refs.reduce((total, ref) => total + ref.weight * lhr.audits[ref.id].score, 0) / weight : 1;
}
const RUNS = Number(process.env.LH_RUNS ?? 3);

const up = async () => {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
};

// Vite allows one preview server per project: use the running one, or start it.
let server = null;
if (!(await up())) {
  server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
  process.on("exit", () => server?.kill());
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}
if (!(await up())) {
  console.error(`No server answered at ${BASE}.`);
  process.exit(1);
}
const stop = () => server?.kill();

// In CI, Playwright's Chromium; locally, the installed Chrome.
let chromePath;
if (process.env.CI) chromePath = (await import("@playwright/test")).chromium.executablePath();
const chrome = await launch({ chromePath, chromeFlags: ["--headless=new", "--no-sandbox"] });

mkdirSync("lighthouse", { recursive: true });
let failed = 0;
for (const path of PAGES) {
  const runs = [];
  for (let run = 0; run < RUNS; run++) {
    const result = await lighthouse(`${BASE}${path}`, { port: chrome.port, output: "html", logLevel: "error" });
    const { runtimeError, runWarnings } = result.lhr;
    if (runtimeError) console.error(`  Lighthouse could not measure ${path}: ${runtimeError.code} ${runtimeError.message}`);
    for (const warning of runWarnings ?? []) console.warn(`  warning: ${warning}`);
    runs.push(result);
  }
  // The median run by performance score: the one in the middle.
  runs.sort((a, b) => (a.lhr.categories.performance.score ?? 0) - (b.lhr.categories.performance.score ?? 0));
  const median = runs[Math.floor(runs.length / 2)];
  const { categories, audits } = median.lhr;
  writeFileSync(`lighthouse/${path === "/" ? "lab" : path.replaceAll("/", "")}.html`, median.report);
  const spread = runs.map((r) => Math.round((r.lhr.categories.performance.score ?? 0) * 100)).join(", ");
  console.log(`\n${path}  (median of ${runs.length}; performance in each run: ${spread})`);
  const hidden = NOT_INDEXED.has(path);
  for (const [key, min] of Object.entries(GATE)) {
    const score = hidden && key === "seo" ? seoWithoutIndexing(median.lhr) : (categories[key].score ?? 0);
    const ok = score >= min;
    if (!ok) failed++;
    const note = hidden && key === "seo" ? " (kept out of search on purpose; indexability not counted)" : "";
    console.log(`  ${ok ? "ok  " : "FAIL"} ${key.padEnd(15)} ${Math.round(score * 100)} (gate ${Math.round(min * 100)})${note}`);
  }
  if (hidden) {
    const noindex = audits["is-crawlable"].score === 0;
    if (!noindex) failed++;
    console.log(`  ${noindex ? "ok  " : "FAIL"} noindex         ${noindex ? "yes" : "missing"}`);
  }
  for (const id of ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift"]) {
    console.log(`       ${id.padEnd(26)} ${audits[id]?.displayValue ?? "not measured"}`);
  }
}

await chrome.kill();
stop();
if (failed) {
  console.error(`\n${failed} score(s) under the gate.`);
  process.exit(1);
}
