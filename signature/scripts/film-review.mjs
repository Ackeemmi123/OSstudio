/**
 * Films every lab page while a hand scrolls it, and measures the motion, so
 * animation is judged from films and numbers, not from stills.
 *
 * Each page is opened on desktop (1440 × 900) and on a phone (Pixel 7) and
 * scrolled from top to bottom twice, each time from a fresh load: once at a
 * steady speed in small wheel steps, once stop-and-go (a screen, a pause, a
 * short flick back up, a pause, on), which is what shows jank, pins that jump
 * and things that snap. Both passes are filmed at the page's own frame rate
 * with Chrome's screencast and encoded to VP9 WebM in Chrome itself, with
 * WebCodecs and webm-muxer. While it scrolls, the page records every frame
 * (requestAnimationFrame), long tasks, long animation frames with the scripts
 * in them, and layout shifts with the elements that moved. Each film is read
 * back frame by frame for visual jumps: change from one frame to the next that
 * scrolling does not explain (a pin that jumps, something that snaps into
 * place instead of moving there).
 *
 *   npm run film-review                          every page, both devices
 *   FR_PAGES=/,/scen/ npm run film-review        some pages
 *
 * Writes review-films/<run>/: summary.md (a table across pages), report.json
 * (every number), and per page <page>/<device>-steady.webm, -stopgo.webm,
 * -sheet.png (24 frames at even scroll positions, with the frame times drawn
 * along the page), -jumps.png (each visual jump, before and after) and
 * <device>.md (the frame report).
 *
 * Env: FR_PAGES (paths, default all seven), FR_DEVICES (desktop,phone),
 * FR_SPEED (screens a second, default 1), FR_QUERY (for example ?webgl),
 * FR_PORT (default 4317), FR_WAIT (seconds to wait before each page for the
 * load average to fall under 3), FR_KEEP_FRAMES=1 (keeps the JPEG frames).
 *
 * One page and one browser at a time, to keep the machine's load down. Builds
 * nothing: it uses a running preview server, or starts one, and checks that
 * the server serves this checkout's dist/. Uses the installed Chrome, which
 * headless still draws WebGL on the real graphics card (in CI: Playwright's
 * Chromium, without a GPU, so WebGL shows its still picture).
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { availableParallelism, loadavg } from "node:os";
import { join, relative, resolve } from "node:path";
import { chromium, devices } from "@playwright/test";

const HERE = resolve(import.meta.dirname, "..");
const FILMS = join(HERE, "review-films");
const PORT = Number(process.env.FR_PORT ?? 4317);
const BASE = `http://127.0.0.1:${PORT}`;
const PATHS = (process.env.FR_PAGES ?? "/,/scen/,/bibliotek/,/visning/,/hantverk/,/lekfull/,/404.html").split(",").filter(Boolean);
const QUERY = process.env.FR_QUERY ?? "";
// Screens a second: about the speed of a steady scroll on a trackpad.
const SPEED = Number(process.env.FR_SPEED ?? 1);
const KEEP_FRAMES = Boolean(process.env.FR_KEEP_FRAMES);
// Seconds to wait, before each page and device, for the load to fall under the limit (0: no waiting).
const WAIT_QUIET = Number(process.env.FR_WAIT ?? 0);
// The 1-minute load average above which frame numbers are not to be trusted.
const LOAD_LIMIT = 3;
// rAF times are rounded to 0.1 ms and fall on the screen's 60 Hz beat (16.7, 33.3, 50 ms …), so a frame
// counts as over 16.7 ms (one frame dropped) from 18 ms, and as over 33 ms (two or more dropped) from 35 ms.
const OVER_ONE = 18;
const OVER_TWO = 35;
const SHEET_FRAMES = 24;
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const pad = (n, width = 2) => String(n).padStart(width, "0");
const round = (n, digits = 0) => Number(n.toFixed(digits));

const DEVICES = {
  desktop: { use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, film: { maxWidth: 1440, maxHeight: 900 }, bitrate: 2_500_000 },
  phone: { use: devices["Pixel 7"], film: { maxWidth: 540, maxHeight: 1200 }, bitrate: 1_200_000 },
};
const deviceNames = (process.env.FR_DEVICES ?? "desktop,phone").split(",");
for (const name of deviceNames) {
  if (!DEVICES[name]) {
    console.error(`Unknown device "${name}". Known: ${Object.keys(DEVICES).join(", ")}.`);
    process.exit(1);
  }
}
const pageName = (path) => (path === "/" ? "lab" : path.replace(/\.html$/, "").replaceAll("/", ""));
const builtFile = (path) => join(HERE, "dist", path.endsWith("/") ? `${path}index.html` : path);
const pages = PATHS.map((path) => ({ path, name: pageName(path), built: builtFile(path) }));

// ---------- The server (as in scripts/review.mjs) ----------

if (pages.some((page) => !existsSync(page.built))) {
  console.error(`There is no build of ${pages.filter((p) => !existsSync(p.built)).map((p) => p.path).join(" ")}. Run npm run build first (or check FR_PAGES).`);
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
const folder = server ? null : serverFolder();
if (folder && folder !== realpathSync(HERE)) {
  console.error(`The server at ${BASE} was started in ${folder}, not in this checkout. Run on another port: FR_PORT=4367 npm run film-review`);
  process.exit(1);
}
const served = await Promise.all(pages.map(async (page) => (await (await fetch(`${BASE}${page.path}`)).text()) === readFileSync(page.built, "utf8")));
if (served.includes(false)) {
  console.error(`The server at ${BASE} does not serve this checkout's dist/. Stop that server, or run on another port: FR_PORT=4367 npm run film-review`);
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
const RUN = join(FILMS, runId);
mkdirSync(RUN, { recursive: true });
const CORES = availableParallelism();
// The film frames (JPEG) of the page being filmed, kept in memory: thousands of small files would keep
// the system's file indexers busy, which is load of its own. FR_KEEP_FRAMES=1 also writes them to .frames/.
const FRAMES = new Map();
const startLoad = loadavg()[0];

// ---------- In the page: the recorder ----------

/**
 * Runs in every page before its own scripts. Observers note long tasks, long animation frames and layout
 * shifts from the start; `__film.start()` begins a frame log (rAF time and scroll position of every frame)
 * and `__film.stop()` ends it and returns everything since the start.
 */
function recorder() {
  if (window.top !== window) return;
  // The intro curtains play once per visit; the film is about scrolling the page behind them.
  try {
    sessionStorage.setItem("sg-intro", "1");
    sessionStorage.setItem("sg-intro-hantverk", "1");
  } catch {}
  const describe = (node) => {
    if (!node) return "(gone)";
    if (node.nodeType !== 1) return node.nodeName.toLowerCase();
    const one = (el) => {
      let name = el.localName;
      if (el.id) name += `#${el.id}`;
      const classes = [...el.classList].slice(0, 2);
      if (classes.length) name += `.${classes.join(".")}`;
      const sg = el.getAttribute("data-sg");
      if (sg) name += `[data-sg="${sg}"]`;
      return name;
    };
    return node.parentElement && node.parentElement !== document.body ? `${one(node.parentElement)} > ${one(node)}` : one(node);
  };
  const rect = (r) => (r ? [r.x, r.y, r.width, r.height].map(Math.round) : null);
  const log = { longtasks: [], loafs: [], shifts: [] };
  const observe = (type, take) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(take)).observe({ type, buffered: true });
    } catch {}
  };
  observe("longtask", (e) => log.longtasks.push({ t: e.startTime, ms: e.duration }));
  observe("long-animation-frame", (e) =>
    log.loafs.push({
      t: e.startTime,
      ms: e.duration,
      blocking: e.blockingDuration,
      script: e.scripts.reduce((sum, s) => sum + s.duration, 0),
      layout: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
      scripts: [...e.scripts]
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 3)
        .map((s) => ({ ms: s.duration, layout: s.forcedStyleAndLayoutDuration, invoker: s.invoker, source: `${s.sourceURL.split("/").pop()}${s.sourceFunctionName ? ` ${s.sourceFunctionName}` : ""}` })),
    }),
  );
  observe("layout-shift", (e) =>
    log.shifts.push({ t: e.startTime, value: e.value, input: e.hadRecentInput, sources: e.sources.map((s) => ({ node: describe(s.node), from: rect(s.previousRect), to: rect(s.currentRect) })) }),
  );
  let frames = null;
  let started = 0;
  const tick = (now) => {
    if (!frames) return;
    frames.push(now, scrollY);
    requestAnimationFrame(tick);
  };
  window.__film = {
    start() {
      frames = [];
      started = performance.now();
      requestAnimationFrame(tick);
      return { started, origin: performance.timeOrigin };
    },
    stop() {
      const out = { started, stopped: performance.now(), frames, ...log, height: document.documentElement.scrollHeight, viewport: innerHeight };
      frames = null;
      return out;
    },
    where: () => ({ y: scrollY, max: document.documentElement.scrollHeight - innerHeight }),
  };
}

// ---------- In a page of its own: encoding, visual jumps and sheets ----------

/** Runs in the tool page at https://film.invalid/, with webm-muxer loaded as the global WebMMuxer. */
function tools() {
  const frameUrl = (file) => `/f/${file.split("/").map(encodeURIComponent).join("/")}`;
  const load = async (file) => createImageBitmap(await (await fetch(frameUrl(file))).blob());
  // What the last call made, read back by the tool in pieces.
  let out = null;
  window.readOut = (offset, length) =>
    new Promise((done, fail) => {
      const reader = new FileReader();
      reader.onload = () => done(String(reader.result).split(",")[1] ?? "");
      reader.onerror = () => fail(reader.error);
      reader.readAsDataURL(new Blob([out.slice(offset, offset + length)]));
    });

  /** webm-muxer writes the duration as the last frame's start; this makes it the whole film (EBML 0x4489, 8-byte float, ms). */
  const setDuration = (buffer, milliseconds) => {
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < Math.min(bytes.length - 11, 4096); i++) {
      if (bytes[i] === 0x44 && bytes[i + 1] === 0x89 && bytes[i + 2] === 0x88) return new DataView(buffer).setFloat64(i + 3, milliseconds, false);
    }
  };

  /** Grey values of a frame at a quarter of its size, for comparing it with the next. */
  const thumb = document.createElement("canvas");
  const thumbContext = thumb.getContext("2d", { willReadFrequently: true });
  const grey = (bitmap, w, h) => {
    thumb.width = w;
    thumb.height = h;
    thumbContext.drawImage(bitmap, 0, 0, w, h);
    const rgba = thumbContext.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    return out;
  };

  /**
   * How much changed from one frame to the next that scrolling does not explain, in grey levels (0–255).
   * The frame is cut into bands across; each band is compared with the last frame as it was and as it was
   * moved by the scroll, and the closer match counts, so content that scrolls, a pinned section and a fixed
   * header all count as unchanged. What is left is motion of the page's own: reveals, WebGL, films, and
   * jumps. Returns the mean over the bands and the band that changed most (its middle, 0–1 down the screen).
   */
  const BAND = 12;
  const residual = (before, now, w, h, dy) => {
    let total = 0;
    let bands = 0;
    let worst = { value: 0, at: 0 };
    for (let top = 0; top < h; top += BAND) {
      const bottom = Math.min(h, top + BAND);
      let still = 0;
      let moved = 0;
      let count = 0;
      for (let y = top; y < bottom; y++) {
        const source = y + dy;
        const s0 = Math.floor(source);
        const f = source - s0;
        // Rows that scrolled in at the edge have nothing to be compared with; they are left out.
        if (s0 < 0 || s0 + 1 >= h) continue;
        for (let x = 0; x < w; x++) {
          const v = now[y * w + x];
          still += Math.abs(v - before[y * w + x]);
          moved += Math.abs(v - (before[s0 * w + x] * (1 - f) + before[(s0 + 1) * w + x] * f));
        }
        count += w;
      }
      if (!count) continue;
      // A whole band as it was or as scrolled. (Choosing row by row would let a jump pass as rows that
      // happen to match; a band that holds both a fixed header and the page under it is left a little
      // change in every frame, which the comparison with the frames around it allows for.)
      const value = Math.min(still, moved) / count;
      total += value;
      bands++;
      if (value > worst.value) worst = { value, at: (top + bottom) / 2 / h };
    }
    return { mean: bands ? total / bands : 0, worst };
  };

  /**
   * Encodes frames (JPEG files with their screen times in seconds) to a VP9 WebM at their own times, so
   * the film plays at the rate the page drew. Also returns the visual change of every frame.
   */
  window.encodeFilm = async ({ frames, bitrate, cssWidth }) => {
    const first = await load(frames[0].file);
    // Film pixels per CSS pixel: the screencast scales the page to fit its largest size.
    const cssToFilm = first.width / cssWidth;
    // VP9 wants even sides; a phone's 540 × 1199 loses its last row.
    const width = first.width & ~1;
    const height = first.height & ~1;
    first.close();
    const codec = (await VideoEncoder.isConfigSupported({ codec: "vp09.00.10.08", width, height, bitrate })).supported ? "vp09.00.10.08" : "vp8";
    const muxer = new WebMMuxer.Muxer({
      target: new WebMMuxer.ArrayBufferTarget(),
      video: { codec: codec === "vp8" ? "V_VP8" : "V_VP9", width, height, frameRate: 60 },
      type: "webm",
      firstTimestampBehavior: "offset",
    });
    let failure = null;
    const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (error) => (failure = error) });
    encoder.configure({ codec, width, height, bitrate, bitrateMode: "variable", framerate: 60, latencyMode: "realtime" });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    const tw = Math.round(width / 4);
    const th = Math.round(height / 4);
    const changes = [];
    let before = null;
    let lastKey = -Infinity;
    const t0 = frames[0].t;
    // A few frames are fetched and decoded ahead while one is encoded.
    const ahead = [];
    const queue = (i) => i < frames.length && ahead.push(load(frames[i].file));
    for (let i = 0; i < 4; i++) queue(i);
    for (let i = 0; i < frames.length; i++) {
      const bitmap = await ahead.shift();
      queue(i + 4);
      context.drawImage(bitmap, 0, 0);
      const seconds = frames[i].t - t0;
      const frame = new VideoFrame(canvas, { timestamp: Math.round(seconds * 1e6) });
      const key = seconds - lastKey >= 2;
      if (key) lastKey = seconds;
      encoder.encode(frame, { keyFrame: key });
      frame.close();
      const now = grey(bitmap, tw, th);
      bitmap.close();
      if (before) {
        const dy = ((frames[i].y - frames[i - 1].y) * cssToFilm * th) / height;
        const change = residual(before, now, tw, th, dy);
        changes.push({ i, mean: change.mean, at: change.worst.at, worst: change.worst.value });
      } else changes.push({ i, mean: 0, at: 0, worst: 0 });
      before = now;
      while (encoder.encodeQueueSize > 6) await new Promise((done) => setTimeout(done, 2));
      if (failure) throw failure;
    }
    await encoder.flush();
    encoder.close();
    if (failure) throw failure;
    muxer.finalize();
    const buffer = muxer.target.buffer;
    setDuration(buffer, (frames.at(-1).t - t0) * 1000 + 1000 / 60);
    out = buffer;
    return { bytes: buffer.byteLength, width, height, codec, changes };
  };

  /** Colour of a frame time: ok, one frame dropped, two or more. */
  const tone = (ms) => (ms > 35 ? "#ff5a4f" : ms > 18 ? "#ffb23d" : "#5d7a96");

  /**
   * A graph of frame times along the page: every frame is a line at its scroll position (x) as tall as it
   * took (16.7 and 33.3 ms marked), with the sheet's frames as numbered ticks and visual jumps as red marks.
   */
  const graph = (ctx, { x, y, w, h, label, frames, maxY, ticks, jumps }) => {
    ctx.fillStyle = "#1b1c20";
    ctx.fillRect(x, y, w, h);
    const cap = 100;
    const yOf = (ms) => y + h - (Math.min(ms, cap) / cap) * (h - 18);
    const xOf = (scroll) => x + (maxY > 0 ? (scroll / maxY) * (w - 1) : 0);
    for (const ms of [16.7, 33.3]) {
      ctx.strokeStyle = "#3a3c44";
      ctx.beginPath();
      ctx.moveTo(x, yOf(ms) + 0.5);
      ctx.lineTo(x + w, yOf(ms) + 0.5);
      ctx.stroke();
      ctx.fillStyle = "#6c6f78";
      ctx.font = "11px system-ui, sans-serif";
      ctx.fillText(`${ms} ms`, x + w - 46, yOf(ms) - 3);
    }
    // Slow frames last, so they stay on top.
    const sorted = frames.map(([scroll, ms]) => [scroll, ms]).sort((a, b) => a[1] - b[1]);
    for (const [scroll, ms] of sorted) {
      ctx.strokeStyle = tone(ms);
      ctx.beginPath();
      ctx.moveTo(Math.round(xOf(scroll)) + 0.5, y + h);
      ctx.lineTo(Math.round(xOf(scroll)) + 0.5, yOf(ms));
      ctx.stroke();
    }
    ctx.fillStyle = "#a9a6a0";
    ctx.font = "500 13px system-ui, sans-serif";
    ctx.fillText(label, x + 8, y + 15);
    ctx.font = "10px system-ui, sans-serif";
    for (const tick of ticks ?? []) {
      ctx.fillStyle = "#a9a6a0";
      ctx.fillRect(Math.round(xOf(tick.y)), y + h, 1, 5);
      ctx.fillText(String(tick.n), Math.round(xOf(tick.y)) - 5, y + h + 15);
    }
    for (const jump of jumps ?? []) {
      ctx.fillStyle = "#ff3b6b";
      ctx.beginPath();
      ctx.moveTo(xOf(jump.y), y + 20);
      ctx.lineTo(xOf(jump.y) - 5, y + 10);
      ctx.lineTo(xOf(jump.y) + 5, y + 10);
      ctx.fill();
    }
  };

  /** Draws a sheet (title, lines of numbers, graphs, then cells of frames) and keeps it as a PNG to read back. */
  window.drawSheet = async ({ title, lines, graphs, cells, columns, cellWidth }) => {
    const images = await Promise.all(cells.map((cell) => load(cell.file)));
    const gap = 16;
    // Labels may have several lines.
    const label = 4 + 18 * Math.max(1, ...cells.map((cell) => cell.label.split("\n").length));
    const head = 40 + lines.length * 20 + 12;
    const graphHeight = 120;
    const graphBlock = graphs.length * (graphHeight + 28);
    const cellHeight = Math.max(...images.map((img) => Math.round((img.height / img.width) * cellWidth)));
    const rows = Math.ceil(cells.length / columns);
    const canvas = document.createElement("canvas");
    canvas.width = gap + columns * (cellWidth + gap);
    canvas.height = head + graphBlock + rows * (label + cellHeight + gap) + gap;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#131315";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f2f0eb";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.fillText(title, gap, 30);
    ctx.font = "14px system-ui, sans-serif";
    lines.forEach((line, i) => {
      ctx.fillStyle = line.flag ? "#ff8a3d" : "#c9c6bf";
      ctx.fillText(line.text, gap, 54 + i * 20);
    });
    graphs.forEach((g, i) => graph(ctx, { ...g, x: gap, y: head + i * (graphHeight + 28), w: canvas.width - 2 * gap, h: graphHeight }));
    ctx.imageSmoothingQuality = "high";
    images.forEach((img, i) => {
      const x = gap + (i % columns) * (cellWidth + gap);
      const y = head + graphBlock + Math.floor(i / columns) * (label + cellHeight + gap);
      const cell = cells[i];
      ctx.fillStyle = cell.flag ? "#ff8a3d" : "#a9a6a0";
      ctx.font = "500 13px system-ui, sans-serif";
      cell.label.split("\n").forEach((text, n) => ctx.fillText(text, x, y + 14 + n * 18));
      const h = Math.round((img.height / img.width) * cellWidth);
      ctx.drawImage(img, x, y + label, cellWidth, h);
      if (cell.mark) {
        // The band that changed most, outlined.
        const top = Math.max(0, Math.min(h * 0.88, cell.mark.at * h - h * 0.06));
        ctx.strokeStyle = "#ff3b6b";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + label + top, cellWidth - 2, h * 0.12);
        ctx.lineWidth = 1;
      }
      img.close();
    });
    const blob = await new Promise((done) => canvas.toBlob(done, "image/png"));
    out = await blob.arrayBuffer();
    return { bytes: out.byteLength, width: canvas.width, height: canvas.height };
  };
}

const TOOL_PAGE = `<!doctype html><meta charset="utf-8"><title>film-review</title><script src="/webm-muxer.js"></script><script>(${tools.toString()})()</script>`;

async function toolPage(browser) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await context.route("https://film.invalid/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/") return route.fulfill({ contentType: "text/html", body: TOOL_PAGE });
    if (path === "/webm-muxer.js") return route.fulfill({ path: join(HERE, "node_modules/webm-muxer/build/webm-muxer.js") });
    if (path.startsWith("/f/")) {
      const body = FRAMES.get(path.slice(3));
      return body ? route.fulfill({ contentType: "image/jpeg", body }) : route.fulfill({ status: 404 });
    }
    return route.fulfill({ status: 404 });
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => console.error(`  tool page: ${error.message}`));
  await page.goto("https://film.invalid/");
  await page.waitForFunction(() => typeof window.encodeFilm === "function" && typeof WebMMuxer === "object");
  return { page, close: () => context.close() };
}

/** Reads what the tool page made last, in pieces, and writes it to a file. */
async function saveOut(page, bytes, file) {
  const parts = [];
  const piece = 4 * 1024 * 1024;
  for (let offset = 0; offset < bytes; offset += piece) parts.push(Buffer.from(await page.evaluate(([o, l]) => window.readOut(o, l), [offset, piece]), "base64"));
  writeFileSync(file, Buffer.concat(parts));
}

// ---------- Scrolling like a hand ----------

const STEP_MS = 33;

/**
 * A hand on a wheel or trackpad: events at a steady 30 a second, sent without waiting for the page, as
 * the system sends them. Playwright's mouse.wheel waits until the page has handled each event, so a busy
 * page would get slower input than a hand gives. While three events are still on their way, the next
 * ones are added together, as the browser coalesces a queue of wheel events.
 */
function hand(cdp, device) {
  const { width, height } = device.use.viewport;
  // An emulated phone divides wheel distances by its pixel ratio; ask for that much more.
  const scale = device.use.isMobile ? device.use.deviceScaleFactor : 1;
  let owed = 0;
  let inFlight = 0;
  return (delta) => {
    owed += delta;
    if (inFlight >= 3) return;
    const deltaY = owed * scale;
    owed = 0;
    inFlight++;
    cdp
      .send("Input.dispatchMouseEvent", { type: "mouseWheel", x: width / 2, y: height / 2, deltaX: 0, deltaY })
      .catch(() => {})
      .finally(() => inFlight--);
  };
}

/**
 * Top to bottom. Steady: small wheel steps at one speed. Stop-and-go: a screen at that speed, a pause, a
 * short quick flick back up (a quarter of a screen), a pause, and on.
 */
async function drive(page, cdp, pass, device) {
  const viewport = device.use.viewport.height;
  const wheel = hand(cdp, device);
  const events = [];
  const mark = (what) => events.push({ at: Date.now(), what });
  // Where the page is, asked a few times a second beside the input, never in its way.
  let position = await page.evaluate(() => window.__film.where());
  let asking = true;
  const asker = (async () => {
    while (asking) {
      position = await page.evaluate(() => window.__film.where()).catch(() => position);
      await wait(120);
    }
  })();
  let lastY = position.y;
  let movedAt = Date.now();
  const atEnd = () => {
    const { y, max } = position;
    if (Math.abs(y - lastY) >= 1) movedAt = Date.now();
    lastY = y;
    if (y >= max - 2) return true;
    if (Date.now() - movedAt > 3000) {
      mark(`stuck at y ${Math.round(y)} of ${Math.round(max)}`);
      return true;
    }
    return false;
  };
  /** Wheel steps of one size on a clock (every `every` ms) for a distance, or until the bottom. */
  const roll = async (distance, every = STEP_MS, size = (SPEED * viewport * STEP_MS) / 1000) => {
    const steps = Math.max(1, Math.round(Math.abs(distance) / size));
    const t0 = Date.now();
    for (let k = 1; k <= steps; k++) {
      wheel(distance / steps);
      const left = t0 + k * every - Date.now();
      if (left > 0) await wait(left);
      if (distance > 0 && atEnd()) return true;
    }
    return false;
  };
  const limit = Date.now() + 240_000;
  if (position.max < 2) mark("the page does not scroll");
  else if (pass === "steady") {
    mark("steady");
    while (Date.now() < limit && !(await roll(viewport)));
  } else {
    while (Date.now() < limit) {
      mark("on");
      if (await roll(viewport)) break;
      mark("pause");
      await wait(550);
      mark("flick up");
      await roll(-viewport * 0.28, 16, viewport * 0.07);
      mark("pause");
      await wait(400);
    }
  }
  mark("at the bottom");
  // Smooth scrolling runs on after the last step; the film ends once the page is at rest.
  await wait(1200);
  asking = false;
  await asker;
  return events;
}

// ---------- Filming one pass ----------

async function film(browser, pageInfo, deviceName, pass) {
  const device = DEVICES[deviceName];
  const context = await browser.newContext({ ...device.use, reducedMotion: "no-preference" });
  await context.addInitScript(recorder);
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => message.type() === "error" && errors.push(message.text()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE}${pageInfo.path}${QUERY}`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  // The hand rests on the page. The first wheel event after a load reaches the page uncancelable in
  // headless Chrome, so smooth scrolling cannot take it and the page jumps natively; a 1 px nudge spends it.
  const { width, height } = device.use.viewport;
  await page.mouse.move(width / 2, height / 2);
  await page.mouse.wheel(0, 1);
  // A moment at the top for what starts after load (WebGL, the first reveals).
  await wait(1200);

  const dir = `.frames/${pageInfo.name}/${deviceName}-${pass}`;
  if (KEEP_FRAMES) mkdirSync(join(RUN, dir), { recursive: true });
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    const file = `${dir}/${pad(frames.length, 5)}.jpg`;
    const jpeg = Buffer.from(data, "base64");
    FRAMES.set(file, jpeg);
    if (KEEP_FRAMES) writeFileSync(join(RUN, file), jpeg);
    frames.push({ file, t: metadata.timestamp ?? Date.now() / 1000, y: metadata.scrollOffsetY ?? 0 });
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1, ...device.film });
  // The screencast costs a few frames as it starts; measuring begins after.
  await wait(600);
  const { started, origin } = await page.evaluate(() => window.__film.start());
  const events = await drive(page, cdp, pass, device);
  const log = await page.evaluate(() => window.__film.stop());
  await cdp.send("Page.stopScreencast");
  await wait(100);
  // Frames can arrive out of order (each is copied from the compositor on its own); a film runs by their screen times.
  frames.sort((a, b) => a.t - b.t);
  for (let i = frames.length - 1; i > 0; i--) if (frames[i].t - frames[i - 1].t < 0.001) frames.splice(i - 1, 1);
  const html = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  await context.close();
  return { pass, origin, started, events, log, frames, errors, html };
}

// ---------- Numbers ----------

/** Seconds into the film of a page time (ms since the page's time origin). */
const filmTime = (recording, t) => (recording.origin + t) / 1000 - recording.frames[0].t;

function measure(recording) {
  const { log } = recording;
  const times = [];
  const ys = [];
  for (let i = 0; i < log.frames.length; i += 2) {
    times.push(log.frames[i]);
    ys.push(log.frames[i + 1]);
  }
  /** The scroll position when a page time came. */
  const yAt = (t) => {
    let lo = 0;
    let hi = times.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (times[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return Math.round(ys[lo] ?? 0);
  };
  const inWindow = (t) => t >= log.started && t <= log.stopped;
  const deltas = times.slice(1).map((t, i) => ({ ms: t - times[i], y: Math.round(ys[i + 1]), from: Math.round(ys[i]), film: round(filmTime(recording, t), 2) }));
  const seconds = (log.stopped - log.started) / 1000;
  const over = (ms) => deltas.filter((d) => d.ms > ms).length;
  const slowest = [...deltas].sort((a, b) => b.ms - a.ms);
  const steps = deltas.map((d) => ({ step: d.y - d.from, ms: round(d.ms, 1), y: d.y, film: d.film }));
  const biggestStep = steps.reduce((best, s) => (Math.abs(s.step) > Math.abs(best?.step ?? 0) ? s : best), null);
  const longtasks = log.longtasks.filter((e) => inWindow(e.t)).map((e) => ({ ms: round(e.ms), y: yAt(e.t), film: round(filmTime(recording, e.t), 2) }));
  const loafs = log.loafs
    .filter((e) => inWindow(e.t))
    .sort((a, b) => b.ms - a.ms)
    .map((e) => ({ ms: round(e.ms), blocking: round(e.blocking), script: round(e.script), layout: round(e.layout), other: round(Math.max(0, e.ms - e.script - e.layout)), y: yAt(e.t), film: round(filmTime(recording, e.t), 2), scripts: e.scripts.map((s) => ({ ...s, ms: round(s.ms), layout: round(s.layout) })) }));
  const shifts = log.shifts.filter((e) => inWindow(e.t)).map((e) => ({ value: round(e.value, 4), input: e.input, y: yAt(e.t), film: round(filmTime(recording, e.t), 2), sources: e.sources }));
  return {
    frames: deltas.length,
    seconds: round(seconds, 1),
    fps: round(deltas.length / seconds, 1),
    overOne: deltas.length ? over(OVER_ONE) / deltas.length : 0,
    overTwo: deltas.length ? over(OVER_TWO) / deltas.length : 0,
    countOverOne: over(OVER_ONE),
    countOverTwo: over(OVER_TWO),
    slowest: slowest.slice(0, 8).map((d) => ({ ...d, ms: round(d.ms, 1) })),
    biggestStep,
    longtasks,
    loafs,
    shifts,
    shiftTotal: round(shifts.filter((s) => !s.input).reduce((sum, s) => sum + s.value, 0), 4),
    graph: deltas.map((d) => [d.y, round(d.ms, 1)]),
    height: log.height,
    viewport: log.viewport,
    filmFrames: recording.frames.length,
  };
}

/**
 * Visual jumps: frames that changed far more than the frames around them, in what scrolling does not
 * explain. A reveal or a WebGL scene changes a little every frame; a snap changes a lot in one. Change is
 * counted per 60 Hz frame: where the screencast missed frames, the change since the last film frame is
 * shared out over the frames it missed, so a gap in the film is not taken for a jump.
 */
function findJumps(changes, frames) {
  const perFrame = changes.map((c, i) => (i ? c.mean / Math.max(1, Math.round(((frames[i].t - frames[i - 1].t) * 1000) / (1000 / 60))) : 0));
  const jumps = [];
  for (let i = 1; i < changes.length; i++) {
    const around = perFrame.slice(Math.max(1, i - 20), i).concat(perFrame.slice(i + 1, i + 21)).sort((a, b) => a - b);
    const usual = around.length ? around[Math.floor(around.length / 2)] : 0;
    const value = perFrame[i];
    if (value > 4 && value > usual * 4 + 1.5) {
      jumps.push({ i, value: round(value, 1), usual: round(usual, 1), at: round(changes[i].at, 2), y: Math.round(frames[i].y), from: Math.round(frames[i - 1].y), film: round(frames[i].t - frames[0].t, 2), gap: Math.round((frames[i].t - frames[i - 1].t) * 1000) });
    }
  }
  // Neighbouring frames of one jump count once: the biggest.
  const merged = [];
  for (const jump of jumps) {
    const last = merged.at(-1);
    if (last && jump.i - last.i <= 3) {
      if (jump.value > last.value) merged[merged.length - 1] = jump;
    } else merged.push(jump);
  }
  return merged.sort((a, b) => b.value - a.value);
}

// ---------- Reports ----------

/** Whether the machine was too busy for the frame numbers, at the start of a page or when its filming ended. */
const busy = (result) => result.load > LOAD_LIMIT || result.loadAfterFilming > LOAD_LIMIT;

const pct = (share) => `${(share * 100).toFixed(1)} %`;
const describeLongest = (m) => (m.slowest[0] ? `${m.slowest[0].ms} ms at y ${m.slowest[0].y} (${m.slowest[0].film} s)` : "–");

function pageReport(result) {
  const lines = [`# ${result.path} · ${result.device}`, ""];
  lines.push(`Run ${runId}, ${result.viewport.width} × ${result.viewport.height}, ${BASE}${result.path}${QUERY}. Load average: ${result.load.toFixed(1)} at the start, ${result.loadAfterFilming.toFixed(1)} when filming ended (${CORES} cores).`);
  if (busy(result)) lines.push("", `> **Warning:** the 1-minute load average was ${result.load.toFixed(1)} when this page started and ${result.loadAfterFilming.toFixed(1)} when filming ended (over ${LOAD_LIMIT}), so its frame numbers are not trustworthy. Run it again when the machine is quieter.`);
  lines.push("", `WebGL: ${result.html.sgWebgl ?? "–"}, smooth scrolling: ${result.html.sgSmooth ?? "–"}, motion: ${result.html.sgMotion ?? "–"}.`);
  if (result.errors.length) lines.push("", `Console errors: ${result.errors.map((e) => `\`${e.slice(0, 200)}\``).join("; ")}`);
  for (const pass of result.passes) {
    const m = pass.measured;
    lines.push("", `## ${pass.pass === "steady" ? "Steady scroll" : "Stop and go"}`, "");
    lines.push(`Film: [${pass.film}](${pass.film}), ${m.filmFrames} frames over ${m.seconds} s (${pass.codec}, ${Math.round(pass.bytes / 1024)} KB). Page height ${m.height} px.`);
    for (const note of pass.events.filter((e) => /stuck|does not scroll/.test(e.what))) lines.push("", `Note: ${note.what}.`);
    lines.push("", `- Frames drawn: ${m.frames} in ${m.seconds} s (${m.fps} a second)`);
    lines.push(`- Over 16.7 ms (one or more dropped): ${m.countOverOne} (${pct(m.overOne)}); over 33 ms (two or more): ${m.countOverTwo} (${pct(m.overTwo)})`);
    lines.push(`- Longest frame: ${describeLongest(m)}`);
    if (m.biggestStep) lines.push(`- Biggest scroll step in one frame: ${m.biggestStep.step} px in a ${m.biggestStep.ms} ms frame, at y ${m.biggestStep.y} (${m.biggestStep.film} s)`);
    lines.push(`- Long tasks: ${m.longtasks.length}${m.longtasks.length ? ` (${m.longtasks.map((t) => `${t.ms} ms at y ${t.y}, ${t.film} s`).slice(0, 6).join("; ")})` : ""}`);
    lines.push(`- Layout shifts: ${m.shifts.length}, total ${m.shiftTotal}`);
    lines.push(`- Visual jumps: ${pass.jumps.length}`);
    if (m.slowest.some((d) => d.ms > OVER_ONE)) {
      lines.push("", "Slowest frames:", "", "| ms | scroll y | from y | film s |", "| --: | --: | --: | --: |");
      for (const d of m.slowest.filter((d) => d.ms > OVER_ONE)) lines.push(`| ${d.ms} | ${d.y} | ${d.from} | ${d.film} |`);
    }
    if (m.loafs.length) {
      lines.push("", "Long animation frames (over 50 ms): where the time went, and the scripts in them. Time that is neither script nor style and layout is rendering: paint, raster, the GPU, decoding.", "", "| ms | script | style and layout | other | blocking | scroll y | film s | scripts |", "| --: | --: | --: | --: | --: | --: | --: | --- |");
      for (const l of m.loafs.slice(0, 8)) lines.push(`| ${l.ms} | ${l.script} | ${l.layout} | ${l.other} | ${l.blocking} | ${l.y} | ${l.film} | ${l.scripts.map((s) => `${s.source || s.invoker} ${s.ms} ms${s.layout ? ` (forced layout ${s.layout} ms)` : ""}`).join("; ") || "–"} |`);
    }
    if (m.shifts.length) {
      lines.push("", "Layout shifts:", "", "| value | scroll y | film s | moved |", "| --: | --: | --: | --- |");
      for (const s of m.shifts.slice(0, 10)) lines.push(`| ${s.value}${s.input ? " (after input)" : ""} | ${s.y} | ${s.film} | ${s.sources.map((src) => `\`${src.node}\` ${src.from?.join(",")} → ${src.to?.join(",")}`).join("; ")} |`);
    }
    if (pass.jumps.length) {
      lines.push("", "Visual jumps (change that scrolling does not explain, in grey levels per 60 Hz frame; see the jumps sheet):", "", "| change | usual | scroll y | screen | film s | since last film frame |", "| --: | --: | --: | --: | --: | --: |");
      for (const j of pass.jumps.slice(0, 8)) lines.push(`| ${j.value} | ${j.usual} | ${j.from} → ${j.y} | ${Math.round(j.at * 100)} % down | ${j.film} | ${j.gap} ms |`);
    }
  }
  return lines.join("\n") + "\n";
}

function summary(results) {
  const lines = [`# Film review ${runId}`, ""];
  lines.push(`${results.length} page and device runs from ${BASE}${QUERY ? ` with ${QUERY}` : ""}, scrolled at ${SPEED} screen a second. Load average at the start: ${startLoad.toFixed(1)} on ${CORES} cores.`);
  if (startLoad > LOAD_LIMIT) lines.push("", `> **Warning:** the 1-minute load average was ${startLoad.toFixed(1)} (over ${LOAD_LIMIT}) at the start, so the frame numbers below are not trustworthy. Run again when the machine is quieter.`);
  const loaded = results.filter(busy);
  if (loaded.length) lines.push("", `Load over ${LOAD_LIMIT} while these were filmed (at the start → when filming ended), so their frame numbers are not trustworthy: ${loaded.map((r) => `${r.path} ${r.device} (${r.load.toFixed(1)} → ${r.loadAfterFilming.toFixed(1)})`).join(", ")}.`);
  lines.push(
    "",
    `A frame counts as over 16.7 ms from ${OVER_ONE} ms (one frame dropped) and over 33 ms from ${OVER_TWO} ms (two or more). Visual jumps are frames that changed far more than the frames around them, in what scrolling does not explain.`,
    "",
    "| page | device | pass | frames | > 16.7 ms | > 33 ms | longest frame | long tasks | layout shift | visual jumps | sheet |",
    "| --- | --- | --- | --: | --: | --: | --- | --: | --: | --- | --- |",
  );
  for (const r of results) {
    for (const pass of r.passes) {
      const m = pass.measured;
      const jumps = pass.jumps.length ? `${pass.jumps.length} (worst ${pass.jumps[0].value} at y ${pass.jumps[0].y})` : "0";
      lines.push(
        `| ${r.path} | ${r.device} | ${pass.pass} | ${m.frames} (${m.fps}/s) | ${pct(m.overOne)} | ${pct(m.overTwo)} | ${describeLongest(m)} | ${m.longtasks.length} | ${m.shiftTotal} (${m.shifts.length}) | ${jumps} | [sheet](${r.page}/${r.device}-sheet.png), [report](${r.page}/${r.device}.md) |`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

// ---------- Sheets ----------

/** About 24 frames at even scroll positions (or even times, when the page does not scroll). */
function pickSheetFrames(frames) {
  const maxY = Math.max(...frames.map((f) => f.y));
  const picked = [];
  if (maxY < 2) {
    for (let n = 0; n < Math.min(SHEET_FRAMES, frames.length); n++) picked.push(Math.round((n / Math.max(1, Math.min(SHEET_FRAMES, frames.length) - 1)) * (frames.length - 1)));
    return { picked, maxY };
  }
  for (let n = 0; n < SHEET_FRAMES; n++) {
    const target = (n / (SHEET_FRAMES - 1)) * maxY;
    const i = frames.findIndex((f) => f.y >= target - 0.5);
    picked.push(i === -1 ? frames.length - 1 : i);
  }
  return { picked, maxY };
}

async function sheets(tool, result, recordings) {
  const layout = result.device === "phone" ? { columns: 8, cellWidth: 180 } : { columns: 6, cellWidth: 360 };
  const steady = recordings.find((r) => r.pass === "steady");
  const steadyPass = result.passes.find((p) => p.pass === "steady");
  const { picked, maxY } = pickSheetFrames(steady.frames);
  // The slowest frame on the way from the last cell to this one, when it dropped two frames or more.
  const slowBefore = (from, to) => Math.max(0, ...steadyPass.measured.graph.filter(([gy]) => gy > from && gy <= to).map(([, ms]) => ms));
  const cells = picked.map((i, n) => {
    const f = steady.frames[i];
    const t = round(f.t - steady.frames[0].t, 1);
    const slow = slowBefore(n ? steady.frames[picked[n - 1]].y : -1, f.y);
    return { file: f.file, label: `${pad(n + 1)} · y ${Math.round(f.y)} · ${t} s${slow > OVER_TWO ? ` · ${Math.round(slow)} ms frame on the way` : ""}`, flag: slow > OVER_TWO };
  });
  const stat = (pass) => {
    const m = pass.measured;
    return `${pass.pass === "steady" ? "Steady" : "Stop and go"}: ${m.frames} frames (${m.fps}/s) · over 16.7 ms ${pct(m.overOne)} · over 33 ms ${pct(m.overTwo)} · longest ${describeLongest(m)} · long tasks ${m.longtasks.length} · layout shift ${m.shiftTotal} · visual jumps ${pass.jumps.length}`;
  };
  const lines = result.passes.map((pass) => ({ text: stat(pass), flag: pass.measured.overTwo > 0.01 || pass.jumps.length > 0 }));
  if (busy(result)) lines.push({ text: `Load average ${result.load.toFixed(1)} at the start, ${result.loadAfterFilming.toFixed(1)} when filming ended (over ${LOAD_LIMIT}): frame numbers not trustworthy.`, flag: true });
  const graphMax = Math.max(maxY, ...result.passes.map((p) => Math.max(0, ...p.measured.graph.map(([y]) => y))));
  const graphs = result.passes.map((pass) => ({
    label: `${pass.pass === "steady" ? "Steady" : "Stop and go"}: frame times along the page (scroll y 0–${Math.round(graphMax)})`,
    frames: pass.measured.graph,
    maxY: graphMax,
    ticks: pass.pass === "steady" ? picked.map((i, n) => ({ n: n + 1, y: steady.frames[i].y })) : [],
    jumps: pass.jumps,
  }));
  const sheet = await tool.page.evaluate((spec) => window.drawSheet(spec), {
    title: `${result.path} · ${result.device} ${result.viewport.width}×${result.viewport.height} · steady scroll, ${picked.length} frames at even scroll positions · ${runId}`,
    lines,
    graphs,
    cells,
    ...layout,
  });
  await saveOut(tool.page, sheet.bytes, join(RUN, result.page, `${result.device}-sheet.png`));

  // Each visual jump: the frame before and the frame of the jump, the band that changed most outlined.
  const jumpCells = [];
  for (const pass of result.passes) {
    const recording = recordings.find((r) => r.pass === pass.pass);
    for (const jump of pass.jumps.slice(0, 6)) {
      const before = recording.frames[jump.i - 1];
      const time = round(before.t - recording.frames[0].t, 2);
      jumpCells.push(
        { file: before.file, label: `${pass.pass === "steady" ? "steady" : "stop and go"}, before\ny ${Math.round(before.y)} · ${time} s` },
        { file: recording.frames[jump.i].file, label: `y ${jump.y} · ${jump.film} s\nchange ${jump.value} (usual ${jump.usual})`, flag: true, mark: { at: jump.at } },
      );
    }
  }
  if (jumpCells.length) {
    const jumpsSheet = await tool.page.evaluate((spec) => window.drawSheet(spec), {
      title: `${result.path} · ${result.device} · visual jumps, before and after · ${runId}`,
      lines: [{ text: "The change scrolling does not explain, in grey levels; the band that changed most is outlined." }],
      graphs: [],
      cells: jumpCells,
      ...(result.device === "phone" ? { columns: 6, cellWidth: 240 } : { columns: 4, cellWidth: 560 }),
    });
    await saveOut(tool.page, jumpsSheet.bytes, join(RUN, result.page, `${result.device}-jumps.png`));
  }
}

// ---------- Main ----------

const started = Date.now();
console.log(`Film review ${runId}: ${pages.map((p) => p.path).join(" ")} on ${deviceNames.join(" and ")}, from ${BASE}${QUERY}`);
if (startLoad > LOAD_LIMIT) console.warn(`Warning: the 1-minute load average is ${startLoad.toFixed(1)} (over ${LOAD_LIMIT}); frame numbers will not be trustworthy.`);
const browser = await chromium.launch({ channel: process.env.CI ? undefined : "chrome", args: ["--enable-unsafe-swiftshader"] });
const results = [];
// Written after every page, so a run that is stopped keeps what it has.
const writeSummary = () => {
  writeFileSync(join(RUN, "summary.md"), summary(results));
  writeFileSync(
    join(RUN, "report.json"),
    JSON.stringify({ run: runId, commit, dirty, date: new Date().toISOString(), base: BASE, query: QUERY, speed: SPEED, load: { start: startLoad, cores: CORES, limit: LOAD_LIMIT }, results }, null, 1),
  );
};
for (const pageInfo of pages) {
  for (const deviceName of deviceNames) {
    for (const until = Date.now() + WAIT_QUIET * 1000; loadavg()[0] > LOAD_LIMIT && Date.now() < until; ) await wait(5000);
    const load = loadavg()[0];
    const t0 = Date.now();
    let tool = null;
    try {
      const recordings = [];
      for (const pass of ["steady", "stopgo"]) recordings.push(await film(browser, pageInfo, deviceName, pass));
      mkdirSync(join(RUN, pageInfo.name), { recursive: true });
      const { width, height } = DEVICES[deviceName].use.viewport;
      const result = { page: pageInfo.name, path: pageInfo.path, device: deviceName, viewport: { width, height }, load, errors: [...new Set(recordings.flatMap((r) => r.errors))], html: recordings[0].html, passes: [] };
      // Filming is over before encoding starts, so encoding never costs the page frames.
      result.loadAfterFilming = loadavg()[0];
      tool = await toolPage(browser);
      for (const recording of recordings) {
        if (!recording.frames.length) throw new Error(`no film frames in the ${recording.pass} pass`);
        const filmFile = `${deviceName}-${recording.pass}.webm`;
        const encoded = await tool.page.evaluate((spec) => window.encodeFilm(spec), { frames: recording.frames, bitrate: DEVICES[deviceName].bitrate, cssWidth: width });
        await saveOut(tool.page, encoded.bytes, join(RUN, pageInfo.name, filmFile));
        result.passes.push({
          pass: recording.pass,
          film: filmFile,
          codec: encoded.codec,
          bytes: encoded.bytes,
          events: recording.events.map((e) => ({ ...e, film: round(e.at / 1000 - recording.frames[0].t, 2) })),
          measured: measure(recording),
          jumps: findJumps(encoded.changes, recording.frames),
          changes: encoded.changes.map((c) => round(c.mean, 2)),
        });
      }
      await sheets(tool, result, recordings);
      writeFileSync(join(RUN, pageInfo.name, `${deviceName}.md`), pageReport(result));
      results.push(result);
      writeSummary();
      const line = result.passes.map((p) => `${p.pass} ${pct(p.measured.overOne)} >16.7, ${pct(p.measured.overTwo)} >33, longest ${p.measured.slowest[0]?.ms ?? "–"} ms, ${p.jumps.length} jumps`).join(" | ");
      console.log(`  ${pageInfo.path.padEnd(12)} ${deviceName.padEnd(8)} ${line} (${Math.round((Date.now() - t0) / 1000)} s${busy(result) ? `, load ${load.toFixed(1)} → ${result.loadAfterFilming.toFixed(1)}` : ""})`);
    } catch (error) {
      console.error(`  ${pageInfo.path.padEnd(12)} ${deviceName.padEnd(8)} failed: ${error.stack ?? error.message}`);
      process.exitCode = 1;
    } finally {
      await tool?.close();
      FRAMES.clear();
    }
  }
}
await browser.close();
server?.kill();
writeSummary();
console.log(`Films, sheets and reports: ${relative(process.cwd(), RUN)}/ (${Math.round((Date.now() - started) / 1000)} s). Start with summary.md.`);
