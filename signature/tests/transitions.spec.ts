import { expect, test, type Locator, type Page } from "@playwright/test";
import { handedToWorker, withoutOffscreenCanvas, withoutWebGL } from "./webgl";

/**
 * Picture transitions (`data-sg-transition`, src/engine/transitions.ts): each
 * named arrival runs, in its own way, and ends with the whole picture; with
 * reduced motion, without WebGL and without JavaScript the picture is simply
 * there. When a picture is held back and that a shown one never vanishes is
 * the image effect's own rule, tested for every picture in library.spec.ts.
 */

const PAGE = "/bibliotek/";
const NAMES = ["wipe", "dissolve", "warp", "slices"] as const;
type Name = (typeof NAMES)[number];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Scrolls by hand until the element is in the middle of the screen, or just below it, measuring again each step, since modules above it grow as they start. */
async function scrollUntil(page: Page, element: Locator, where: "middle" | "below", step = 60) {
  for (let i = 0; i < 1500; i++) {
    const done = await element.evaluate(
      (target, [by, to]) => {
        const box = target.getBoundingClientRect();
        // "below": the whole frame just under the screen, where it has not been seen but is near enough to start.
        const off = to === "middle" ? box.top + box.height / 2 - innerHeight / 2 : box.top - innerHeight - 40;
        if (Math.abs(off) <= 2) return true;
        const before = scrollY;
        window.scrollBy(0, Math.sign(off) * Math.min(by as number, Math.abs(off)));
        return scrollY === before;
      },
      [step, where] as const,
    );
    if (done) return;
    await page.waitForTimeout(16);
  }
  throw new Error("Never got there.");
}

interface Seen {
  t: number;
  on: boolean;
  opaque: boolean;
  live: boolean;
  phase: string;
  state: string;
}

/** Every frame, for every picture with a named transition: on screen, its <img> opaque, the shader's copy on, and its states. */
async function watchPictures(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("sg-intro", "1");
    const frames: Record<string, Seen[]> = {};
    (window as unknown as { sgSeen: typeof frames }).sgSeen = frames;
    const record = (t: number) => {
      for (const frame of document.querySelectorAll<HTMLElement>("[data-sg-transition]")) {
        const box = frame.getBoundingClientRect();
        (frames[frame.dataset.sgTransition!] ??= []).push({
          t,
          on: box.bottom > 0 && box.top < innerHeight,
          opaque: getComputedStyle(frame.querySelector("img")!).opacity === "1",
          live: frame.classList.contains("is-live"),
          phase: frame.dataset.sgPicture ?? "",
          state: frame.dataset.sgState ?? "",
        });
      }
      requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });
}
const seen = (page: Page) => page.evaluate(() => (window as unknown as { sgSeen: Record<string, Seen[]> }).sgSeen);

/** One row of a drawn frame, read from the canvas: how much of it shows the picture (0–1), by half, and how often it changes between shown and not along the row. */
interface Row {
  mean: number;
  left: number;
  right: number;
  edges: number;
  min: number;
}
interface Draw {
  t: number;
  /** Rows 15 %, 50 % and 85 % up from the bottom. */
  rows: Row[];
}

/**
 * Records what each transition's shader actually drew, frame by frame: right
 * after every draw on a picture's canvas, three rows of it are read back. The
 * stage must draw on the main thread for this (`withoutOffscreenCanvas`).
 */
async function watchDraws(page: Page) {
  await page.addInitScript(() => {
    const draws: Record<string, Draw[]> = {};
    (window as unknown as { sgDraws: typeof draws }).sgDraws = draws;
    const original = WebGLRenderingContext.prototype.drawArrays;
    WebGLRenderingContext.prototype.drawArrays = function (this: WebGLRenderingContext, ...args: Parameters<typeof original>) {
      original.apply(this, args);
      const frame = this.canvas instanceof HTMLCanvasElement ? this.canvas.closest<HTMLElement>("[data-sg-transition]") : null;
      if (!frame) return;
      const width = this.drawingBufferWidth;
      const height = this.drawingBufferHeight;
      const pixels = new Uint8Array(width * 4);
      const half = Math.floor(width / 2);
      const rows = [0.15, 0.5, 0.85].map((at) => {
        this.readPixels(0, Math.floor(height * at), width, 1, this.RGBA, this.UNSIGNED_BYTE, pixels);
        let left = 0;
        let right = 0;
        let edges = 0;
        let min = 255;
        for (let x = 0; x < width; x++) {
          const alpha = pixels[x * 4 + 3];
          if (x < half) left += alpha;
          else right += alpha;
          if (alpha < min) min = alpha;
          if (x && alpha >= 128 !== pixels[x * 4 - 1] >= 128) edges++;
        }
        return { mean: (left + right) / width / 255, left: left / half / 255, right: right / (width - half) / 255, edges, min };
      });
      (draws[frame.dataset.sgTransition!] ??= []).push({ t: performance.now(), rows });
    };
  });
}

/** How far two screenshots of the same size are from each other: the mean difference per colour channel, 0–255. */
async function difference(page: Page, a: Buffer, b: Buffer): Promise<number> {
  return page.evaluate(
    async ([first, second]) => {
      const read = async (data: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        const context = canvas.getContext("2d")!;
        context.drawImage(bitmap, 0, 0);
        return context.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [one, two] = [await read(first), await read(second)];
      if (one.width !== two.width || one.height !== two.height) return 255;
      let sum = 0;
      for (let i = 0; i < one.data.length; i++) sum += Math.abs(one.data[i] - two.data[i]);
      return sum / one.data.length;
    },
    [a.toString("base64"), b.toString("base64")],
  );
}

/** At rest the shader's copy is the picture: the frame looks the same with its canvas and with only its <img>. */
async function expectWhole(page: Page, frame: Locator, name: string) {
  const withShader = await frame.screenshot();
  await frame.locator("canvas").evaluate((canvas) => (canvas.style.visibility = "hidden"));
  const plain = await frame.screenshot();
  await frame.locator("canvas").evaluate((canvas) => (canvas.style.visibility = ""));
  expect(await difference(page, withShader, plain), `${name}: the shader's picture at rest is not the picture`).toBeLessThan(4);
}

for (const name of NAMES) {
  test(`${name}: the picture arrives its own way and ends whole, on frames the shader drew`, async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await withoutOffscreenCanvas(page);
    await watchPictures(page);
    await watchDraws(page);
    await page.goto(`${PAGE}?webgl`);
    const frame = page.locator(`[data-sg-transition="${name}"]`);
    // Just under the screen: near enough to start its shader, not yet seen, so it is held back to arrive.
    await scrollUntil(page, frame, "below");
    await expect(frame).toHaveAttribute("data-sg-state", "webgl", { timeout: 30_000 });
    await expect(frame).toHaveAttribute("data-sg-picture", "waiting");
    // The shader compiles in the background meanwhile; a picture on screen is never kept waiting for it.
    await page.waitForTimeout(2000);
    await scrollUntil(page, frame, "middle");
    await expect(frame).toHaveAttribute("data-sg-picture", "shown", { timeout: 30_000 });
    await expect(frame).toHaveClass(/is-live/);
    await page.waitForTimeout(400);

    const own = (await seen(page))[name];
    const phases = own.map((f) => f.phase).filter((phase, i, all) => phase !== all[i - 1]);
    expect(phases.slice(-3), `${name} went ${phases.join(" → ")}`).toEqual(["waiting", "arriving", "shown"]);
    // Hidden only while it waited or arrived; shown, its <img> is there in every frame.
    expect(own.filter((f) => !f.opaque && f.phase !== "waiting" && f.phase !== "arriving")).toEqual([]);
    expect(own.at(-1)).toMatchObject({ on: true, opaque: true, live: true, phase: "shown", state: "webgl" });

    const draws = (await page.evaluate(() => (window as unknown as { sgDraws: Record<string, Draw[]> }).sgDraws))[name] ?? [];
    expect(draws.length, `${name} drew ${draws.length} frames`).toBeGreaterThan(5);
    const cover = draws.map((draw) => draw.rows.reduce((sum, row) => sum + row.mean, 0) / draw.rows.length);
    // It ran: from (nearly) nothing, through a part of the picture, never back.
    expect(Math.min(...cover), `${name} started at ${cover[0]}`).toBeLessThan(0.2);
    expect(cover.some((c) => c > 0.2 && c < 0.8), `${name} was never part of the way: ${cover.map((c) => c.toFixed(2)).join(" ")}`).toBe(true);
    for (let i = 1; i < cover.length; i++) expect(cover[i], `${name} went back at frame ${i}: ${cover[i - 1]} → ${cover[i]}`).toBeGreaterThan(cover[i - 1] - 0.03);
    // It ended whole: every pixel read from the last frames is the picture, fully opaque.
    for (const draw of draws.slice(-3)) expect(Math.min(...draw.rows.map((row) => row.min)), `${name} ended with a pixel not shown`).toBe(255);

    // In its own way.
    const middle = draws.map((draw) => draw.rows[1]);
    const most = Math.max(...draws.flatMap((draw) => draw.rows.map((row) => row.edges)));
    const checks: Record<Name, () => void> = {
      // One soft edge, the left side first.
      wipe: () => {
        expect(Math.max(...middle.map((row) => row.left - row.right)), "wipe: the left never led").toBeGreaterThan(0.3);
        expect(most, "wipe: more than one edge").toBeLessThanOrEqual(2);
      },
      // Grain: the picture and the empty frame change places many times along a row.
      dissolve: () => expect(most, "dissolve: no grain").toBeGreaterThan(40),
      // The bottom first.
      warp: () => {
        expect(Math.max(...draws.map((draw) => draw.rows[0].mean - draw.rows[2].mean)), "warp: the bottom never led").toBeGreaterThan(0.3);
        expect(most, "warp: more than one edge").toBeLessThanOrEqual(2);
      },
      // Upright slices (more edges than any single wipe has), never grain.
      slices: () => {
        expect(most, "slices: no slices").toBeGreaterThanOrEqual(3);
        expect(most, "slices: grain, not slices").toBeLessThanOrEqual(40);
      },
    };
    checks[name]();

    await expectWhole(page, frame, name);
    expect(errors).toEqual([]);
  });
}

test("in a worker: every named picture ends shown, drawn there, whole, with one small chunk and no layout shift", async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectErrors(page);
  const chunks: string[] = [];
  page.on("request", (request) => /\/transitions-[^/]*\.js$/.test(request.url()) && chunks.push(request.url()));
  await watchPictures(page);
  await page.addInitScript(() => {
    const shifts: { value: number; nodes: string[] }[] = [];
    (window as unknown as { sgShifts: typeof shifts }).sgShifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node: Node | null }[] }>) {
        if (!entry.hadRecentInput) shifts.push({ value: entry.value, nodes: entry.sources.map((source) => (source.node instanceof Element ? source.node.className : String(source.node))) });
      }
    }).observe({ type: "layout-shift" });
    const transfer = HTMLCanvasElement.prototype.transferControlToOffscreen;
    HTMLCanvasElement.prototype.transferControlToOffscreen = function (this: HTMLCanvasElement) {
      this.dataset.testHanded = "worker";
      return transfer.call(this);
    };
  });
  await page.goto(`${PAGE}?webgl`);
  // Nothing of the transitions is fetched for the first view.
  await page.waitForLoadState("load");
  expect(chunks).toEqual([]);
  for (const name of NAMES) {
    const frame = page.locator(`[data-sg-transition="${name}"]`);
    await scrollUntil(page, frame, "middle");
    await expect(frame).toHaveAttribute("data-sg-picture", "shown", { timeout: 30_000 });
    await expect(frame).toHaveClass(/is-live/, { timeout: 30_000 });
    expect(await frame.locator("canvas").evaluate(handedToWorker), `${name} was not drawn in a worker`).toBe(true);
    await page.waitForTimeout(300);
    await expectWhole(page, frame, name);
  }
  expect(new Set(chunks).size).toBe(1);
  // Six pictures on one page: more than the four WebGL contexts Chrome keeps alive in one worker. None lost its shader to a later one.
  const states = await page.locator('[data-sg="reveal"]').evaluateAll((frames) => frames.map((frame) => (frame as HTMLElement).dataset.sgState));
  expect(states).toEqual(Array(6).fill("webgl"));
  const all = await seen(page);
  for (const name of NAMES) {
    // Once it showed on screen as its own <img>, it never vanished.
    const own = all[name];
    const first = own.findIndex((f) => f.on && f.opaque);
    expect(first, `${name} never showed`).toBeGreaterThanOrEqual(0);
    expect(own.slice(first).filter((f) => !f.opaque), `${name} vanished after it showed`).toEqual([]);
  }
  const shifts = await page.evaluate(() => (window as unknown as { sgShifts: { value: number; nodes: string[] }[] }).sgShifts);
  expect(shifts.filter((shift) => shift.nodes.some((node) => /reveal/.test(node)))).toEqual([]);
  expect(errors).toEqual([]);
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no transition: each picture is simply there, and nothing is fetched for it", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await watchPictures(page);
    await page.goto(`${PAGE}?webgl`);
    for (const name of NAMES) {
      const frame = page.locator(`[data-sg-transition="${name}"]`);
      await scrollUntil(page, frame, "middle", 200);
      await page.waitForTimeout(500);
      await expect(frame.locator("img")).toBeVisible();
      await expect(frame.locator("canvas")).toHaveCSS("opacity", "0");
    }
    const all = await seen(page);
    for (const name of NAMES) {
      expect(all[name].length).toBeGreaterThan(10);
      expect(all[name].filter((f) => !f.opaque || f.live || f.phase || f.state === "webgl"), `${name} was touched with reduced motion`).toEqual([]);
    }
    expect(requests.filter((url) => /transitions-|stage-worker|stage-core/.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });
});

test("without WebGL each picture is the plain image, never hidden", async ({ page }) => {
  test.setTimeout(60_000);
  const errors = collectErrors(page);
  await withoutWebGL(page);
  await watchPictures(page);
  await page.goto(`${PAGE}?webgl`);
  for (const name of NAMES) {
    const frame = page.locator(`[data-sg-transition="${name}"]`);
    await scrollUntil(page, frame, "middle");
    await expect(frame).toHaveAttribute("data-sg-picture", "shown", { timeout: 20_000 });
    await expect(frame).toHaveAttribute("data-sg-state", "still");
    await expect(frame.locator("img")).toBeVisible();
    await expect(frame.locator("canvas")).toHaveCSS("opacity", "0");
  }
  const all = await seen(page);
  for (const name of NAMES) {
    expect(all[name].filter((f) => !f.opaque || f.live || f.state === "webgl"), `${name} was hidden or drawn without WebGL`).toEqual([]);
  }
  expect(errors).toEqual([]);
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the four pictures are plain images", async ({ page }) => {
    await page.goto(PAGE);
    for (const name of NAMES) {
      const image = page.locator(`[data-sg-transition="${name}"] img`);
      await image.scrollIntoViewIfNeeded();
      await expect(image).toBeVisible();
      await expect(image).toHaveCSS("opacity", "1");
      await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    }
  });
});

test.describe("pictures that name no transition, or one that does not exist", () => {
  test("arrive as before, and fetch nothing for transitions", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    const chunks: string[] = [];
    page.on("request", (request) => /\/transitions-[^/]*\.js$/.test(request.url()) && chunks.push(request.url()));
    await page.addInitScript(() => sessionStorage.setItem("sg-intro", "1"));
    await page.goto("/hantverk/?webgl");
    const frame = page.locator('[data-sg="reveal"]').nth(1);
    await scrollUntil(page, frame, "middle");
    await expect(frame).toHaveAttribute("data-sg-picture", "shown", { timeout: 30_000 });
    await expect(frame).toHaveClass(/is-live/, { timeout: 30_000 });
    expect(chunks).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("an unknown name arrives the usual way: shown, drawn by the shader", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = collectErrors(page);
    await page.addInitScript(() => sessionStorage.setItem("sg-intro", "1"));
    await page.route("**/hantverk/?webgl", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replaceAll('data-sg="reveal"', 'data-sg="reveal" data-sg-transition="constructor"') });
    });
    await page.goto("/hantverk/?webgl");
    const frame = page.locator('[data-sg-transition="constructor"]').nth(1);
    await scrollUntil(page, frame, "middle");
    await expect(frame).toHaveAttribute("data-sg-picture", "shown", { timeout: 30_000 });
    await expect(frame).toHaveClass(/is-live/, { timeout: 30_000 });
    await expect(frame.locator("img")).toHaveCSS("opacity", "1");
    expect(errors).toEqual([]);
  });
});
