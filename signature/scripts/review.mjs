/**
 * Visual review of the built lab, screen by screen, for a person to look at
 * and for catching regressions.
 *
 * Every page (read from the inputs in `vite.config.ts`) is opened on desktop
 * (1440 × 900) and on a phone (Pixel 7). It is scrolled like a visitor
 * scrolls, in wheel steps so modules mount as they come near, and one
 * screenshot is taken per screen height once motion has settled. Each page
 * and device also gets a contact sheet with every screen on it. Each screen
 * is also taken held still (WebGL hidden, marquees and loops at their start),
 * which is the same in every run, so a compare can be exact; the README
 * explains what that leaves as noise.
 *
 *   npm run review                  a run in review/<run>/
 *   npm run review -- --baseline    … and keep it as review/baseline/
 *   npm run review -- --compare     … and compare it with the baseline
 *
 * Options: --pages=lab,scen (names from vite.config.ts or paths such as /scen/),
 * --devices=desktop,phone, --jobs=<n> (pages captured at once, default 3),
 * --settle=<ms> (fixed wait after motion stops, default 900), --threshold=<0–1>
 * (pixelmatch colour distance, default 0.1), --tolerance=<percent> (share of a
 * still screen that may differ before it counts as changed, default 0.02).
 *
 * Builds nothing: it uses a running preview server, or starts one, and checks
 * that the server serves this checkout's `dist/`. REVIEW_PORT picks the port
 * (default 4317).
 */
import { spawn, execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import { join, relative, resolve } from "node:path";
import { chromium, devices } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { loadConfigFromFile } from "vite";

const HERE = resolve(import.meta.dirname, "..");
const REVIEW = join(HERE, "review");
const BASELINE = join(REVIEW, "baseline");
const PORT = Number(process.env.REVIEW_PORT ?? 4317);
const BASE = `http://127.0.0.1:${PORT}`;
// Software WebGL on, and the 3D band's quality fixed so it never steps down mid-run.
const QUERY = "?webgl&quality=2";
const MAX_SCREENS = 40;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");

// ---------- Options ----------

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...value] = arg.replace(/^--/, "").split("=");
    return [key, value.length ? value.join("=") : true];
  }),
);
for (const key of args.keys()) {
  if (!["baseline", "compare", "pages", "devices", "jobs", "settle", "threshold", "tolerance"].includes(key)) {
    console.error(`Unknown option --${key}. See the comment at the top of scripts/review.mjs.`);
    process.exit(1);
  }
}
const SETTLE = Number(args.get("settle") ?? 900);
const THRESHOLD = Number(args.get("threshold") ?? 0.1);
const TOLERANCE = Number(args.get("tolerance") ?? 0.02) / 100;
// A busy machine settles late and draws WebGL late, which a compare would report as changes.
const CORES = availableParallelism();
const LOAD = loadavg()[0];
const BUSY = LOAD > CORES * 1.5;
const JOBS = Math.max(1, Number(args.get("jobs") ?? (BUSY ? 1 : 3)));

const DEVICES = {
  desktop: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
  phone: devices["Pixel 7"],
};
const deviceNames = String(args.get("devices") ?? "desktop,phone").split(",");
for (const name of deviceNames) {
  if (!DEVICES[name]) {
    console.error(`Unknown device "${name}". Known: ${Object.keys(DEVICES).join(", ")}.`);
    process.exit(1);
  }
}

// The pages are the build's inputs: a page added to vite.config.ts is reviewed without changes here.
const { config } = await loadConfigFromFile({ command: "build", mode: "production" }, join(HERE, "vite.config.ts"), undefined, "silent");
const allPages = Object.entries(config.build.rolldownOptions.input).map(([name, file]) => {
  const built = relative(config.root, file).replaceAll("\\", "/");
  return { name, path: `/${built}`.replace(/(^|\/)index\.html$/, "$1"), built: join(HERE, "dist", built) };
});
// "404" is a number-like key, which JavaScript puts first; pages like it go last instead.
allPages.sort((a, b) => a.path.endsWith(".html") - b.path.endsWith(".html"));
const wanted = args.has("pages") ? String(args.get("pages")).split(",") : null;
const pages = wanted ? allPages.filter((page) => wanted.includes(page.name) || wanted.includes(page.path)) : allPages;
if (!pages.length) {
  console.error(`No page matches --pages=${args.get("pages")}. Pages: ${allPages.map((p) => `${p.name} (${p.path})`).join(", ")}.`);
  process.exit(1);
}
if (args.has("compare") && !existsSync(join(BASELINE, "manifest.json"))) {
  console.error("There is no baseline yet. Make one with: npm run review -- --baseline");
  process.exit(1);
}

// ---------- The server ----------

if (pages.some((page) => !existsSync(page.built))) {
  console.error("There is no build to review. Run npm run build first.");
  process.exit(1);
}
const up = async () => {
  try {
    return (await fetch(BASE)).ok;
  } catch {
    return false;
  }
};
/** The folder of the process listening on the port, where lsof can tell; null where it cannot. */
function serverFolder() {
  try {
    const pid = execFileSync("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split("\n")[0];
    const cwd = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" });
    const folder = cwd.split("\n").find((line) => line.startsWith("n"))?.slice(1);
    return folder ? realpathSync(folder) : null;
  } catch {
    return null;
  }
}

// Vite allows one preview server per project: use the running one, or start it.
let server = null;
if (!(await up())) {
  // Vite itself rather than through npx, so that stopping it stops the server.
  const vite = join(HERE, "node_modules/vite/bin/vite.js");
  server = spawn(process.execPath, [vite, "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { cwd: HERE, stdio: "ignore" });
  process.on("exit", () => server?.kill());
  for (let i = 0; i < 60 && !(await up()); i++) await wait(500);
}
if (!(await up())) {
  console.error(`No server answered at ${BASE}.`);
  process.exit(1);
}
// Another checkout's preview may hold the port; reviewing its build would mislead. A server started
// elsewhere is refused, and so is one here that serves other files (an older build, another --outDir).
const folder = server ? null : serverFolder();
if (folder && folder !== realpathSync(HERE)) {
  console.error(`The server at ${BASE} was started in ${folder}, not in this checkout. Run on another port: REVIEW_PORT=4320 npm run review`);
  process.exit(1);
}
const served = await Promise.all(pages.map(async (page) => (await (await fetch(`${BASE}${page.path}`)).text()) === readFileSync(page.built, "utf8")));
if (served.includes(false)) {
  console.error(
    `The server at ${BASE} does not serve this checkout's dist/ (another checkout's preview, or an older build).\n` +
      `Stop that server, or run on another port: REVIEW_PORT=4320 npm run review`,
  );
  server?.kill();
  process.exit(1);
}

// ---------- A run ----------

const git = (...command) => {
  try {
    return execFileSync("git", command, { cwd: HERE, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
};
const commit = git("rev-parse", "--short", "HEAD") || "nogit";
const dirty = git("status", "--porcelain", "--", ".") !== "";
const at = new Date();
const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
const runId = `${stamp}_${commit}${dirty ? "-dirty" : ""}`;
const RUN = join(REVIEW, runId);
mkdirSync(RUN, { recursive: true });

// Each job gets its own browser, and so its own software GPU: sharing one, a silk field on one page
// can starve another page's shader for many seconds.
const launch = () => chromium.launch({ channel: process.env.CI ? undefined : "chrome", args: ["--enable-unsafe-swiftshader"] });
const browser = await launch();

/** What the page looks like right now: scroll, height, and whether anything is still on its way. */
const probe = (page) =>
  page.evaluate(() => {
    const inView = (el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    };
    // Time-based animations that will end (CSS rises, transitions). Scroll-driven ones and loops never "finish".
    const busy = document.getAnimations().filter((a) => {
      if (a.playState !== "running" || a.timeline !== document.timeline) return false;
      return Number.isFinite(a.effect?.getComputedTiming().endTime);
    }).length;
    const loading = [...document.images].filter((img) => inView(img) && !img.complete).length;
    // A WebGL module marks itself .is-live once its first frame is drawn; until then the still picture shows.
    const starting = [...document.querySelectorAll("canvas")].filter(
      (canvas) => inView(canvas) && canvas.closest("[data-sg-state]")?.dataset.sgState === "webgl" && !canvas.closest(".is-live"),
    ).length;
    return { y: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight, busy, loading, starting };
  });

/**
 * Waits until scrolling has stopped, CSS motion has ended, pictures in view have loaded and WebGL in view
 * has drawn, then a fixed while for springs and GSAP. Something that starts during that while (a scene
 * whose shader compiles slowly in software) is waited for in turn.
 */
async function settle(page, fixed = SETTLE) {
  const end = Date.now() + 15_000;
  while (Date.now() < end) {
    let last = null;
    let calm = 0;
    while (calm < 5 && Date.now() < end) {
      const now = await probe(page);
      const still = last && now.y === last.y && now.height === last.height;
      calm = still && !now.busy && !now.loading && !now.starting ? calm + 1 : 0;
      last = now;
      if (calm < 5) await wait(60);
    }
    if (calm < 5) break;
    await wait(fixed);
    const after = await probe(page);
    if (after.y === last.y && after.height === last.height && !after.busy && !after.loading && !after.starting) return true;
  }
  return false;
}

/** The parts that move by themselves (WebGL canvases, marquees, films, looping CSS), in CSS pixels within the viewport. */
const movingParts = (page) =>
  page.evaluate(() => {
    const parts = [];
    const add = (kind, el, state) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(0, r.left);
      const y = Math.max(0, r.top);
      const w = Math.min(innerWidth, r.right) - x;
      const h = Math.min(innerHeight, r.bottom) - y;
      if (w > 0 && h > 0 && getComputedStyle(el).visibility !== "hidden") parts.push({ kind, x, y, w, h, ...(state ? { state } : {}) });
    };
    for (const canvas of document.querySelectorAll("canvas")) {
      const state = canvas.closest("[data-sg-state]")?.dataset.sgState;
      add("webgl", canvas, state === "webgl" ? (canvas.closest(".is-live") ? "drawn" : "starting") : state);
    }
    for (const marquee of document.querySelectorAll('[data-sg="marquee"]')) add("marquee", marquee);
    for (const video of document.querySelectorAll("video")) add("film", video);
    for (const animation of document.getAnimations()) {
      const target = animation.effect?.target;
      if (animation.playState === "running" && target instanceof Element && animation.effect.getComputedTiming().endTime === Infinity) add("loop", target);
    }
    return parts;
  });

/**
 * Holds still what moves by itself, for a second picture that is the same in every run: canvases and films hidden
 * (the still design beneath them shows, with the text over them), marquees at their start, loops paused
 * at their first frame. `false` lets them go again.
 */
const freeze = (page, on) =>
  page.evaluate(async (on) => {
    if (on) {
      const style = document.createElement("style");
      style.id = "review-freeze";
      style.textContent = 'canvas, video { visibility: hidden !important; } [data-sg="marquee"] * { transform: none !important; }';
      document.head.append(style);
      window.__reviewLoops = document.getAnimations().filter((a) => a.playState === "running" && a.effect?.getComputedTiming().endTime === Infinity);
      for (const loop of window.__reviewLoops) {
        loop.pause();
        loop.currentTime = 0;
      }
    } else {
      document.getElementById("review-freeze")?.remove();
      for (const loop of window.__reviewLoops ?? []) loop.play();
    }
    // Two frames, so the change is painted before the picture is taken.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, on);

async function capture(browser, pageInfo, deviceName) {
  const dir = join(RUN, pageInfo.name, deviceName);
  mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({ ...DEVICES[deviceName], reducedMotion: "no-preference" });
  // The intro curtains play once per visit; a review looks at the page behind them.
  await context.addInitScript(() => {
    sessionStorage.setItem("sg-intro", "1");
    sessionStorage.setItem("sg-intro-hantverk", "1");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE}${pageInfo.path}${QUERY}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);

  const { width, height } = DEVICES[deviceName].viewport;
  const scale = DEVICES[deviceName].deviceScaleFactor ?? 1;
  // An emulated phone divides wheel distances by its pixel ratio; ask for that much more.
  const wheel = DEVICES[deviceName].isMobile ? scale : 1;
  const step = Math.round(height / 4);
  const screens = [];
  for (let index = 1; index <= MAX_SCREENS; index++) {
    const settled = await settle(page);
    const state = await probe(page);
    const file = `${pad(index)}.png`;
    const still = `${pad(index)}.still.png`;
    await page.screenshot({ path: join(dir, file) });
    const moving = await movingParts(page);
    await freeze(page, true);
    await page.screenshot({ path: join(dir, still) });
    await freeze(page, false);
    screens.push({ index, file, still, y: state.y, height: state.height, settled, moving });
    const bottom = state.height - state.viewport;
    if (state.y >= bottom - 1) break;
    // One screen further, as a visitor's wheel gets there: a few notches, not a jump. A pinned
    // section that changes the page's height on the way can leave it short, so it tops up.
    const target = Math.min(state.y + state.viewport, bottom);
    let y = state.y;
    for (let attempt = 0; attempt < 4 && Math.abs(target - y) > 1; attempt++) {
      const distance = target - y;
      for (let left = Math.abs(distance); left > 0; left -= step) {
        await page.mouse.wheel(0, Math.sign(distance) * Math.min(step, left) * wheel);
        await wait(70);
      }
      await settle(page, 0);
      const before = y;
      y = (await probe(page)).y;
      if (y === before) break;
    }
  }
  const html = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  await context.close();
  return { page: pageInfo.name, path: pageInfo.path, device: deviceName, viewport: { width, height }, scale, html, errors, screens };
}

// ---------- Contact sheets, drawn by Chrome on a canvas ----------

const sheetPage = await (async () => {
  const page = await browser.newPage();
  // Pictures from disk, under an address of its own so the canvas stays readable.
  await page.route("http://review.invalid/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>sheet</title>" });
    return route.fulfill({ path: join(REVIEW, path) });
  });
  await page.goto("http://review.invalid/");
  return page;
})();

/** Tiles pictures in rows on a dark sheet with a title and a label per picture; writes a JPEG. */
async function sheet(out, { title, columns, cellWidth, cells }) {
  const data = await sheetPage.evaluate(
    async ({ title, columns, cellWidth, cells }) => {
      const load = (src) =>
        new Promise((done, fail) => {
          const img = new Image();
          img.onload = () => done(img);
          img.onerror = () => fail(new Error(`could not load ${src}`));
          img.src = src;
        });
      const images = await Promise.all(cells.map((cell) => load(cell.src)));
      const gap = 16;
      const label = 26;
      const head = 64;
      const cellHeight = Math.max(...images.map((img) => Math.round((img.naturalHeight / img.naturalWidth) * cellWidth)));
      const rows = Math.ceil(cells.length / columns);
      const canvas = document.createElement("canvas");
      canvas.width = gap + Math.min(columns, cells.length) * (cellWidth + gap);
      canvas.height = head + rows * (label + cellHeight + gap);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#131315";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#f2f0eb";
      ctx.font = "600 22px system-ui, sans-serif";
      ctx.fillText(title, gap, 40);
      ctx.imageSmoothingQuality = "high";
      images.forEach((img, i) => {
        const x = gap + (i % columns) * (cellWidth + gap);
        const y = head + Math.floor(i / columns) * (label + cellHeight + gap);
        ctx.fillStyle = cells[i].flag ? "#ff8a3d" : "#a9a6a0";
        ctx.font = "500 14px system-ui, sans-serif";
        ctx.fillText(cells[i].label, x, y + 17);
        ctx.drawImage(img, x, y + label, cellWidth, Math.round((img.naturalHeight / img.naturalWidth) * cellWidth));
      });
      return canvas.toDataURL("image/jpeg", 0.9);
    },
    { title, columns, cellWidth, cells },
  );
  writeFileSync(out, Buffer.from(data.split(",")[1], "base64"));
}

const src = (file) => `http://review.invalid/${relative(REVIEW, file).split("/").map(encodeURIComponent).join("/")}`;
const LAYOUT = { desktop: { columns: 4, cellWidth: 480 }, phone: { columns: 8, cellWidth: 206 } };

// ---------- Comparing with the baseline ----------

/** One byte per device pixel: 1 inside a moving part, 2 on an edge that is only part of a pixel. */
function maskOf(parts, scale, width, height, viewport) {
  const mask = new Uint8Array(width * height);
  // 412 CSS pixels at 2.625 are 1081.5 device pixels: the last column blends in whatever lies beyond the edge.
  if (!Number.isInteger(viewport.width * scale)) for (let y = 0; y < height; y++) mask[y * width + width - 1] = 2;
  if (!Number.isInteger(viewport.height * scale)) mask.fill(2, (height - 1) * width);
  for (const part of parts) {
    const x0 = Math.max(0, Math.floor(part.x * scale));
    const y0 = Math.max(0, Math.floor(part.y * scale));
    const x1 = Math.min(width, Math.ceil((part.x + part.w) * scale));
    const y1 = Math.min(height, Math.ceil((part.y + part.h) * scale));
    for (let y = y0; y < y1; y++) for (let i = y * width + x0; i < y * width + x1; i++) if (!mask[i]) mask[i] = 1;
  }
  return mask;
}

/**
 * Two numbers and a picture. The changed share comes from the still pictures (moving parts held still),
 * so it is exact: red in the picture. The moving share is how much the live pictures differ inside the
 * moving parts (outlined in blue): time-based noise, for information.
 */
function diff(before, now, outFile, parts, scale, viewport) {
  const read = (file) => PNG.sync.read(readFileSync(file));
  const [a, b] = [read(before.still), read(now.still)];
  if (a.width !== b.width || a.height !== b.height) return { size: `${a.width}×${a.height} → ${b.width}×${b.height}` };
  const { width, height } = b;
  const mask = maskOf(parts, scale, width, height, viewport);
  const out = new PNG({ width, height });
  const changed = pixelmatch(a.data, b.data, out.data, width, height, { threshold: THRESHOLD, ignoreMask: mask.map((m) => (m === 2 ? 1 : 0)) });
  const outsideMoving = mask.map((m) => (m === 1 ? 0 : 1));
  const movingArea = mask.reduce((sum, m) => sum + (m === 1), 0);
  const moving = movingArea ? pixelmatch(read(before.live).data, read(now.live).data, null, width, height, { threshold: THRESHOLD, ignoreMask: outsideMoving }) : 0;
  // Outline the moving parts.
  for (let i = 0; i < width * height; i++) {
    if (mask[i] !== 1) continue;
    const x = i % width;
    if (x === 0 || x === width - 1 || mask[i - 1] !== 1 || mask[i + 1] !== 1 || mask[i - width] !== 1 || mask[i + width] !== 1) out.data.set([40, 120, 255, 255], i * 4);
  }
  writeFileSync(outFile, PNG.sync.write(out));
  const edge = mask.reduce((sum, m) => sum + (m === 2), 0);
  return { changed: changed / (width * height - edge), moving: movingArea ? moving / movingArea : 0, changedPixels: changed };
}

const percent = (value) => `${(value * 100).toFixed(value && value < 0.001 ? 3 : 2)} %`;
const short = (file) => relative(process.cwd(), file);

async function compare(results) {
  const baseline = JSON.parse(readFileSync(join(BASELINE, "manifest.json"), "utf8"));
  if (baseline.results.some((r) => r.screens.some((s) => !s.still))) {
    console.error("\nThe baseline was made by an older version of the review. Make a new one: npm run review -- --baseline");
    process.exitCode = 1;
    return;
  }
  const rows = [];
  const notes = [];
  const sheets = [];
  let compared = 0;
  for (const result of results) {
    const old = baseline.results.find((r) => r.page === result.page && r.device === result.device);
    if (!old) {
      notes.push(`${result.page} ${result.device}: not in the baseline, nothing to compare.`);
      continue;
    }
    const last = (r) => r.screens.at(-1)?.height;
    if (last(old) !== last(result)) notes.push(`${result.page} ${result.device}: page height ${last(old)} → ${last(result)} px, so screens after the change show other parts of the page.`);
    if (old.screens.length !== result.screens.length) notes.push(`${result.page} ${result.device}: ${old.screens.length} → ${result.screens.length} screens.`);
    const cells = [];
    for (const screen of result.screens) {
      const before = old.screens.find((s) => s.index === screen.index);
      const dir = join(RUN, result.page, result.device);
      if (!before) {
        rows.push({ result, screen, verdict: "new screen" });
        continue;
      }
      compared++;
      const outFile = join(dir, `${pad(screen.index)}.diff.png`);
      const parts = [...before.moving, ...screen.moving];
      const was = join(BASELINE, result.page, result.device);
      const d = diff(
        { live: join(was, before.file), still: join(was, before.still) },
        { live: join(dir, screen.file), still: join(dir, screen.still) },
        outFile,
        parts,
        result.scale,
        result.viewport,
      );
      const states = (s) => s.moving.filter((p) => p.state).map((p) => p.state).join(",");
      const stateChange = states(before) !== states(screen) ? `WebGL ${states(before) || "none"} → ${states(screen) || "none"}` : "";
      // Where WebGL and marquees sit. A loop's box changes with its own animation, so loops are left out.
      const places = (s) =>
        s.moving
          .filter((p) => p.kind !== "loop")
          .map((p) => [p.kind, p.x, p.y, p.w, p.h].map((v) => (typeof v === "number" ? Math.round(v) : v)).join(" "))
          .sort()
          .join("|");
      const placeChange = !stateChange && places(before) !== places(screen) ? "moving parts in other places" : "";
      const moved = before.y !== screen.y ? `scrolled to ${before.y} → ${screen.y}` : "";
      if (!(d.size || d.changed > TOLERANCE || stateChange || placeChange || moved)) continue;
      rows.push({ result, screen, d, outFile, verdict: [d.size && `size ${d.size}`, stateChange, placeChange, moved].filter(Boolean).join("; ") });
      const name = `${pad(screen.index)} · y ${screen.y}`;
      cells.push(
        { src: src(join(BASELINE, result.page, result.device, before.file)), label: `${name} · baseline` },
        { src: src(join(dir, screen.file)), label: `${name} · now` },
        ...(d.size ? [] : [{ src: src(outFile), label: `${name} · ${percent(d.changed)} changed`, flag: true }]),
      );
    }
    for (const gone of old.screens.filter((s) => !result.screens.some((n) => n.index === s.index))) rows.push({ result, screen: gone, verdict: "screen gone" });
    if (cells.length) {
      const out = join(RUN, `${result.page}-${result.device}.compare.jpg`);
      await sheet(out, {
        title: `${result.path} · ${result.device} · baseline ${baseline.run} vs now ${runId}`,
        columns: 3,
        cellWidth: result.device === "phone" ? 300 : 560,
        cells,
      });
      sheets.push(out);
    }
  }

  console.log(`\nCompared with the baseline ${baseline.run}: ${compared} screens.`);
  console.log(
    `A screen has changed when more than ${percent(TOLERANCE)} of it differs with the moving parts held still, a WebGL part\n` +
      `drew differently (drawn, starting, still) or sits elsewhere, or the screen ended at another scroll position.\n` +
      `"Moving parts" is how much the live WebGL and marquees differ: time-based noise, for information only.`,
  );
  if (!rows.length) console.log("\nNo screen changed.");
  else {
    const table = rows.map(({ result, screen, d, outFile, verdict }) => [
      result.page,
      result.device,
      pad(screen.index),
      String(screen.y),
      d && !d.size ? percent(d.changed) : "",
      d && !d.size ? percent(d.moving) : "",
      verdict || "",
      outFile ? short(outFile) : "",
    ]);
    const head = ["page", "device", "screen", "y", "changed", "moving parts", "note", "diff"];
    const widths = head.map((h, i) => Math.max(h.length, ...table.map((row) => row[i].length)));
    const line = (row) => row.map((cell, i) => cell.padEnd(widths[i])).join("  ").trimEnd();
    console.log(`\n${line(head)}\n${line(widths.map((w) => "-".repeat(w)))}`);
    for (const row of table) console.log(line(row));
    console.log(`\n${rows.length} of ${compared} screens changed.`);
  }
  const busy = (run, label) => run.load && run.load.average > run.load.cores * 1.5 && `${label} was taken on a busy machine (load ${run.load.average.toFixed(1)} on ${run.load.cores} cores).`;
  const loadNotes = [busy(baseline, "The baseline"), busy({ load: { average: LOAD, cores: CORES } }, "This run")].filter(Boolean);
  if (loadNotes.length) notes.push(`${loadNotes.join(" ")} A WebGL part shown as "starting", or a screen that did not settle, may be timing only: run again when it is quieter.`);
  const unsettled = rows.filter(({ screen }) => screen.settled === false).length;
  if (unsettled) notes.push(`${unsettled} of the changed screens had not settled after 15 s, so they may differ by timing only.`);
  for (const note of notes) console.log(`Note: ${note}`);
  for (const out of sheets) console.log(`Side by side: ${short(out)}`);
  writeFileSync(
    join(RUN, "compare.json"),
    JSON.stringify(
      {
        baseline: baseline.run,
        run: runId,
        threshold: THRESHOLD,
        tolerance: TOLERANCE,
        compared,
        changed: rows.map(({ result, screen, d, verdict }) => ({ page: result.page, device: result.device, screen: screen.index, y: screen.y, ...d, note: verdict })),
        notes,
      },
      null,
      2,
    ),
  );
}

// ---------- Main ----------

const started = Date.now();
console.log(`Review ${runId}: ${pages.map((p) => p.path).join(" ")} on ${deviceNames.join(" and ")}, from ${BASE}`);
if (BUSY) {
  console.warn(
    `Warning: the machine is busy (load ${LOAD.toFixed(1)} on ${CORES} cores). Screens may settle late and WebGL may not draw in\n` +
      `time, which a compare reports as changes that are only timing. ${args.has("jobs") ? "" : "Running one page at a time; "}best to wait until it is quieter.`,
  );
}
const jobs = pages.flatMap((pageInfo) => deviceNames.map((deviceName) => ({ pageInfo, deviceName })));
const results = new Array(jobs.length);
let next = 0;
// A few pages at a time: most of a run is waiting for motion to settle.
const worker = async () => {
  const own = await launch();
  while (next < jobs.length) {
    const i = next++;
    const { pageInfo, deviceName } = jobs[i];
    let result;
    try {
      result = await capture(own, pageInfo, deviceName);
    } catch (error) {
      console.error(`  ${pageInfo.path.padEnd(12)} ${deviceName.padEnd(8)} failed: ${error.message.split("\n")[0]}`);
      process.exitCode = 1;
      continue;
    }
    results[i] = result;
    const unsettled = result.screens.filter((s) => !s.settled).length;
    console.log(
      `  ${result.path.padEnd(12)} ${deviceName.padEnd(8)} ${String(result.screens.length).padStart(2)} screens` +
        (unsettled ? `, ${unsettled} still moving after 15 s` : "") +
        (result.errors.length ? `, ${result.errors.length} console error(s): ${result.errors[0]}` : ""),
    );
    const dir = join(RUN, result.page, deviceName);
    await sheet(join(RUN, `${result.page}-${deviceName}.jpg`), {
      title: `${result.path} · ${deviceName} ${result.viewport.width}×${result.viewport.height} · ${runId}`,
      ...LAYOUT[deviceName],
      cells: result.screens.map((s) => ({ src: src(join(dir, s.file)), label: `${pad(s.index)} · y ${s.y}${s.settled ? "" : " · still moving"}` })),
    });
  }
  await own.close();
};
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, worker));
const done = results.filter(Boolean);
writeFileSync(
  join(RUN, "manifest.json"),
  JSON.stringify({ run: runId, commit, dirty, date: new Date().toISOString(), base: BASE, query: QUERY, settle: SETTLE, load: { average: LOAD, cores: CORES }, results: done }, null, 2),
);
console.log(`Screens and contact sheets: ${short(RUN)}/ (${Math.round((Date.now() - started) / 1000)} s)`);

if (args.has("compare")) await compare(done);
if (args.has("baseline") && process.exitCode) console.error("Not saved as the baseline, since a page failed.");
else if (args.has("baseline")) {
  rmSync(BASELINE, { recursive: true, force: true });
  cpSync(RUN, BASELINE, { recursive: true, filter: (file) => !/\.(diff\.png|compare\.jpg)$|compare\.json$/.test(file) });
  console.log(`Saved as the baseline: ${short(BASELINE)}/`);
}

await browser.close();
server?.kill();
