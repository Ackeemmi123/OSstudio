import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The image sequence (`data-sg="sequence"`) on the library: pictures of the
 * band drawn on a canvas as the page scrolls, each fading into the next,
 * while the stage holds still: 61 of them, wide for screens and tall for
 * phones.
 * Content first: without JavaScript, with reduced motion and with Save-Data
 * it is the last frame as a plain picture, and only that is fetched. Motion
 * is judged on frames recorded in the page with requestAnimationFrame, never
 * on one sample after a fixed wait.
 */

const PAGE = "/bibliotek/";
/** The pictures in each set. */
const FRAMES = 61;
/** What this screen runs: how many pictures, the last, those fetched first (every fourth; the last is one), and their files. */
const sequenceOf = (isMobile: boolean) => {
  const count = FRAMES;
  const [shape, format] = [isMobile ? "telefon" : "bred", "webp"];
  return {
    count,
    last: count - 1,
    keys: Array.from({ length: (count - 1) / 4 + 1 }, (_, index) => index * 4),
    shape,
    format,
    file: (index: number) => `${shape}/${String(index).padStart(String(count - 1).length, "0")}.${format}`,
  };
};
/** A frame of the sequence: its shape (wide or phone), index and format. */
const FRAME = /sekvens\/(bred|telefon)\/(\d+)\.(webp)/;
const ALT = "Bandets åtta delar av borstad metall som samlas till en hel Möbiusslinga, renderat i kod";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Every frame the page asks for, in order, as "bred/07.webp"; `fetch` only: the module's frames, not the poster. */
function watchFrames(page: Page, type?: "fetch") {
  const frames: string[] = [];
  page.on("request", (request) => {
    const match = FRAME.exec(request.url());
    if (match && (!type || request.resourceType() === type)) frames.push(`${match[1]}/${match[2]}.${match[3]}`);
  });
  return frames;
}

/** Skips the intro curtain, which has its own tests. */
async function open(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("sg-intro", "1"));
  await page.goto(PAGE);
}

const root = (page: Page) => page.locator('[data-sg="sequence"]');
/** Where the canvas is in the movement, in frames: between two of them it shows both, so this is seldom whole. */
const shown = (page: Page) => root(page).locator("canvas").evaluate((canvas: HTMLCanvasElement) => Number(canvas.dataset.frame ?? -1));
/** The canvas rests on this frame (to a twentieth: a scroll position is whole pixels, a frame is a dozen of them). */
const expectFrame = (page: Page, frame: number, timeout = 5000) => expect.poll(async () => Math.abs((await shown(page)) - frame), { timeout }).toBeLessThan(0.05);
/** The scroll that runs the whole movement: the frames take 85 % of the distance the stage is held. */
const runOf = (page: Page) => root(page).evaluate((element) => (element.getBoundingClientRect().height - element.querySelector<HTMLElement>("[data-sg-stage]")!.clientHeight) * 0.85);

/** Where the sequence's track starts on the page; sections above pin and grow as they mount, so it is measured until it holds. */
async function settledTop(page: Page, offset: number) {
  let top = 0;
  for (let round = 0; round < 6; round++) {
    const next = await page.evaluate(() => document.querySelector('[data-sg="sequence"]')!.getBoundingClientRect().top + scrollY);
    if (round > 1 && Math.abs(next - top) < 1) break;
    top = next;
    await page.evaluate((y) => window.scrollTo(0, y), top - offset * (await page.evaluate(() => innerHeight)));
    await page.waitForTimeout(300);
  }
  return top;
}

/** Scrolls the way a hand does, in small steps, so the scroll listener sees every stage. Lands on a whole pixel, as a browser does. */
async function scrollTo(page: Page, rawTarget: number, step = 30) {
  const target = Math.round(rawTarget);
  let at = await page.evaluate(() => scrollY);
  const direction = Math.sign(target - at);
  while (Math.abs(target - at) > 1) {
    at = direction > 0 ? Math.min(target, at + step) : Math.max(target, at - step);
    await page.evaluate((y) => window.scrollTo(0, y), at);
    await page.waitForTimeout(16);
  }
}

type Sample = { frame: number; stage: number; y: number; opacity: number };

/** Records, on every frame the page draws, which picture the canvas shows, where the stage is, and the scroll. */
async function record(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-sg="sequence"]')!;
    const stage = host.querySelector<HTMLElement>("[data-sg-stage]")!;
    const data = { samples: [] as Sample[], stop: false };
    (window as unknown as { sgSequence: typeof data }).sgSequence = data;
    const sample = () => {
      const canvas = host.querySelector("canvas");
      data.samples.push({ frame: Number(canvas?.dataset.frame ?? -1), stage: stage.getBoundingClientRect().top, y: scrollY, opacity: canvas ? Number(getComputedStyle(canvas).opacity) : 0 });
      if (!data.stop) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  return () =>
    page.evaluate(() => {
      const data = (window as unknown as { sgSequence: { samples: Sample[]; stop: boolean } }).sgSequence;
      data.stop = true;
      return data.samples;
    });
}

/**
 * Steps between two painted frames that are larger than the scroll between them explains (plus two frames): a jump.
 * The scroll is what moves the frames, so a busy machine that paints less often may take larger steps, never jumps.
 * The scroll counted is that since the sample before the last: this recorder reads a frame before the module draws
 * in it, so the picture it sees answers the scroll it read one sample earlier.
 */
const jumps = (samples: Sample[], perFrame: number) =>
  samples.slice(1).flatMap((sample, i) => {
    const before = samples[i];
    const earlier = samples[Math.max(0, i - 1)];
    return Math.abs(sample.frame - before.frame) > Math.abs(sample.y - earlier.y) / perFrame + 2 ? [`${before.frame} → ${sample.frame} over ${Math.round(sample.y - earlier.y)} px`] : [];
  });

/**
 * How each word over the picture looks, on each of `frames` frames the page paints once no word is moving: "whole"
 * (inside its window with room above and below for Å, Ä and Ö: a fifth of the type size), "hidden" (clear of the
 * window), or "cut".
 */
async function words(page: Page, frames = 12) {
  // Polled from outside, and the first sample taken at once: without JavaScript the page runs no frame callbacks.
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll(".sequence-lines li")].flatMap((line) => line.getAnimations()).length)).toBe(0);
  return page.evaluate(
    (frames) =>
      new Promise<string[][]>((resolve) => {
        const list = document.querySelector<HTMLElement>(".sequence-lines")!;
        const samples: string[][] = [];
        const sample = () => {
          const box = list.getBoundingClientRect();
          const room = Number.parseFloat(getComputedStyle(list).fontSize) * 0.2;
          samples.push(
            [...list.children].map((line) => {
              const word = line.getBoundingClientRect();
              if (word.bottom <= box.top + 0.5 || word.top >= box.bottom - 0.5) return "hidden";
              return word.top >= box.top + room - 0.5 && word.bottom <= box.bottom - room + 0.5 ? "whole" : "cut";
            }),
          );
          if (samples.length < frames) requestAnimationFrame(sample);
          else resolve(samples);
        };
        sample();
      }),
    frames,
  );
}
/** One word whole, the others hidden. */
const only = (step: number) => [0, 1, 2].map((index) => (index === step ? "whole" : "hidden"));

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** The plain picture: no tall track (the section is as tall as its stage) and nothing held on screen. */
async function expectStill(page: Page, isMobile: boolean) {
  const host = root(page);
  const stage = host.locator("[data-sg-stage]");
  await expect(stage).toHaveCSS("position", "relative");
  const [hostHeight, stageHeight] = await Promise.all([host.evaluate((element) => element.getBoundingClientRect().height), stage.evaluate((element) => element.getBoundingClientRect().height)]);
  expect(Math.abs(hostHeight - stageHeight)).toBeLessThan(1);
  // The last frame, the band whole, at the picture's own shape.
  const picture = host.getByRole("img", { name: ALT });
  await picture.scrollIntoViewIfNeeded();
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  expect(await picture.evaluate((img: HTMLImageElement) => img.currentSrc)).toMatch(isMobile ? /telefon\/60\.webp$/ : /bred\/60\.webp$/);
  expect(await picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(isMobile ? 720 : 1600);
  const box = (await picture.boundingBox())!;
  expect(Math.abs(box.width / box.height - (isMobile ? 720 / 1560 : 1600 / 900))).toBeLessThan(0.01);
  // Its word stands whole in its line; the other two are out of it.
  for (const sample of await words(page, 1)) expect(sample).toEqual(only(2));
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the sequence is its last frame, a plain picture at its own size, and nothing else is fetched", async ({ page, isMobile }) => {
    const frames = watchFrames(page);
    await page.goto(PAGE);
    await expectStill(page, isMobile);
    await expect(root(page).locator("canvas")).toHaveCount(0);
    await expect(root(page).getByText("Ett band.")).toBeAttached();
    await page.waitForTimeout(300);
    expect(frames).toEqual([isMobile ? "telefon/60.webp" : "bred/60.webp"]);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the last frame stands still, nothing is held or fetched; turned off, the sequence starts, and on again, it stops", async ({ page, isMobile }) => {
    const { count: COUNT } = sequenceOf(isMobile);
    // Turned off midway, it loads every frame before it is turned on again.
    test.slow();
    const errors = collectErrors(page);
    const frames = watchFrames(page);
    await open(page);
    await settledTop(page, 0.5);
    await expect(root(page)).toHaveAttribute("data-sg-state", "still");
    await expectStill(page, isMobile);
    await page.waitForTimeout(500);
    expect(frames).toEqual([isMobile ? "telefon/60.webp" : "bred/60.webp"]);
    expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);

    // The visitor turns reduced motion off while here: the stage is held and the frames come.
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(root(page).locator("[data-sg-stage]")).toHaveCSS("position", "sticky");
    await expect(root(page)).toHaveAttribute("data-sg-loaded", String(COUNT), { timeout: 30_000 });
    await settledTop(page, 0.2);
    await expect(root(page)).toHaveAttribute("data-sg-state", "live");
    // And on again: the canvas goes, the last frame is the picture again, and its word is there at once, without a roll.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(root(page)).toHaveAttribute("data-sg-state", "still");
    expect(await page.evaluate(() => [...document.querySelectorAll(".sequence-lines li")].flatMap((line) => line.getAnimations()).length)).toBe(0);
    await expect(root(page).locator(".sequence-lines li").first()).toHaveCSS("transition-duration", "0s");
    await expect(root(page).locator("canvas")).toHaveCSS("opacity", "0");
    await expectStill(page, isMobile);
    expect(errors).toEqual([]);
  });
});

test.describe("with Save-Data", () => {
  test.use({ extraHTTPHeaders: { "Save-Data": "on" } });

  test("the picture is the last frame: no chunk, no frames, nothing held", async ({ page, isMobile }) => {
    // As in tests/video.spec.ts: the header is sent and the property the engine reads is set to what Chrome reports.
    await page.addInitScript(() => {
      const connection = (navigator as Navigator & { connection?: object }).connection;
      if (connection) Object.defineProperty(connection, "saveData", { get: () => true });
      else Object.defineProperty(navigator, "connection", { get: () => ({ saveData: true }) });
    });
    const errors = collectErrors(page);
    const frames = watchFrames(page);
    const chunks: string[] = [];
    page.on("request", (request) => /\/sequence-[^/]*\.js$/.test(request.url()) && chunks.push(request.url()));
    await open(page);
    await settledTop(page, 0.5);
    await expect(root(page)).toHaveAttribute("data-sg-state", "poster");
    await expectStill(page, isMobile);
    await page.waitForTimeout(800);
    expect(frames).toEqual([isMobile ? "telefon/60.webp" : "bred/60.webp"]);
    expect(chunks).toEqual([]);
    await expect(root(page).locator("canvas")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test.describe("with motion", () => {
  test("loads a screen ahead, every fourth frame first, one set for this screen; the stage holds while the drawn frame follows the scroll down and back up, without a jump", async ({ page, isMobile }) => {
    const { count: COUNT, last: LAST, keys: KEYS } = sequenceOf(isMobile);
    // Down through the whole track and back, a hand's step at a time: longer than most.
    test.slow();
    const errors = collectErrors(page);
    const fetched = watchFrames(page, "fetch");
    const chunks: string[] = [];
    page.on("request", (request) => /\/sequence-[^/]*\.js$/.test(request.url()) && chunks.push(request.url().replace(/.*\/(sequence(-worker|-loader)?)-[^/]*$/, "$1")));
    await open(page);
    await page.waitForTimeout(600);
    // At the top of the page nothing of it has come: no chunk, no frames.
    expect(chunks).toEqual([]);
    expect(fetched).toEqual([]);

    const top = await settledTop(page, 1.6);
    await expect(root(page)).toHaveAttribute("data-sg-loaded", String(COUNT), { timeout: 30_000 });
    // The module and its worker, once each.
    expect(chunks.sort()).toEqual(["sequence", "sequence-worker"]);
    // Every fourth frame and the last come first, then the rest; each once, all from the set for this screen.
    expect(fetched.slice(0, KEYS.length).map((name) => Number.parseInt(name.split("/")[1])).sort((a, b) => a - b)).toEqual(KEYS);
    expect(new Set(fetched).size).toBe(COUNT);
    expect(fetched).toHaveLength(COUNT);
    expect(fetched.every((name) => name.startsWith(isMobile ? "telefon/" : "bred/") && name.endsWith(".webp"))).toBe(true);

    const height = await page.evaluate(() => innerHeight);
    const track = await root(page).evaluate((element) => element.getBoundingClientRect().height);
    expect(track).toBeGreaterThan(height * 2.5);
    // The scroll that moves the sequence by one frame.
    const perFrame = (await runOf(page)) / LAST;
    await scrollTo(page, top - height * 0.5, 200);
    // Down through the whole track, a hand's step at a time.
    const down = await record(page);
    await scrollTo(page, top + track - height * 0.5);
    await page.waitForTimeout(200);
    const reading = (await down()).filter((sample) => sample.frame >= 0);
    const frames = reading.map((sample) => sample.frame);
    expect(frames[0]).toBe(0);
    expect(frames[frames.length - 1]).toBe(LAST);
    // One way only, and gradual: no step larger than the scroll between them, and a picture for every step of the hand (30 px is a picture and a quarter, so some 48 of the 61).
    for (let i = 1; i < frames.length; i++) expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]);
    expect(jumps(reading, perFrame)).toEqual([]);
    expect(new Set(frames.map(Math.round)).size).toBeGreaterThan(40);
    // Between two pictures it shows both: most painted positions are not whole frames.
    expect(frames.filter((frame) => frame % 1 !== 0).length).toBeGreaterThan(frames.filter((frame) => frame > 0 && frame < LAST).length * 0.5);
    // The canvas showed from its first frame on, and the stage held still at the top of the screen while the frames ran.
    expect(reading.every((sample) => sample.opacity === 1)).toBe(true);
    const running = reading.filter((sample) => sample.frame > 0 && sample.frame < LAST);
    expect(running.length).toBeGreaterThan(30);
    for (const sample of running) expect(Math.abs(sample.stage)).toBeLessThan(1);
    // The last frame holds for the final stretch before the stage moves on.
    expect(reading.filter((sample) => sample.frame === LAST && Math.abs(sample.stage) < 1).length).toBeGreaterThan(3);

    // Back up: the same pictures the other way.
    const up = await record(page);
    await scrollTo(page, top - height * 0.5);
    await page.waitForTimeout(200);
    const returning = await up();
    const back = returning.map((sample) => sample.frame);
    expect(back[0]).toBe(LAST);
    expect(back[back.length - 1]).toBe(0);
    for (let i = 1; i < back.length; i++) expect(back[i]).toBeLessThanOrEqual(back[i - 1]);
    expect(jumps(returning, perFrame)).toEqual([]);
    expect(new Set(back.map(Math.round)).size).toBeGreaterThan(40);
    expect(errors).toEqual([]);
  });

  test("the words change with the movement: one whole word wherever the reader stops, rolling to the next in time, never flickering at a threshold", async ({ page, isMobile }) => {
    const { count: COUNT } = sequenceOf(isMobile);
    test.slow();
    const errors = collectErrors(page);
    await open(page);
    const top = await settledTop(page, 0.6);
    await expect(root(page)).toHaveAttribute("data-sg-loaded", String(COUNT), { timeout: 30_000 });
    const run = await runOf(page);
    // Watch every move of the words: which property, how long, how eased.
    await page.evaluate(() => {
      const seen = new Set<string>();
      (window as unknown as { sgRolls: Set<string> }).sgRolls = seen;
      const look = () => {
        for (const line of document.querySelectorAll(".sequence-lines li"))
          for (const animation of line.getAnimations()) {
            const timing = animation.effect!.getTiming();
            seen.add(`${(animation as CSSTransition).transitionProperty} ${timing.duration} ${timing.easing}`);
          }
        requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    // At rest inside each part (thresholds at 0.25 and 0.7 of the movement), reading down and back up.
    for (const [at, step] of [
      [0.1, 0],
      [0.45, 1],
      [0.9, 2],
      [0.45, 1],
      [0.1, 0],
    ]) {
      await scrollTo(page, top + run * at, 40);
      await expect(root(page)).toHaveAttribute("data-sg-step", String(step));
      for (const sample of await words(page)) expect(sample).toEqual(only(step));
    }
    // The words rolled on a timed transition of their own: transform only, 0.6 s, the house easing.
    expect(await page.evaluate(() => [...(window as unknown as { sgRolls: Set<string> }).sgRolls])).toEqual(["translate 600 cubic-bezier(0.16, 1, 0.3, 1)"]);
    // Near a threshold the word holds: past 0.25 it changes only at 0.28, and back only at 0.22.
    await scrollTo(page, top + run * 0.31, 20);
    await expect(root(page)).toHaveAttribute("data-sg-step", "1");
    for (const at of [0.24, 0.27, 0.24]) {
      await scrollTo(page, top + run * at, 20);
      await page.waitForTimeout(300);
      await expect(root(page)).toHaveAttribute("data-sg-step", "1");
    }
    await scrollTo(page, top + run * 0.19, 20);
    await expect(root(page)).toHaveAttribute("data-sg-step", "0");
    for (const sample of await words(page)) expect(sample).toEqual(only(0));
    expect(errors).toEqual([]);
  });

  test("the first frame drawn is the poster's own picture, placed the same, so nothing jumps as the canvas takes over", async ({ page }) => {
    await open(page);
    await settledTop(page, 0.6);
    await expect(root(page)).toHaveAttribute("data-sg-state", "live", { timeout: 20_000 });
    await expect(root(page).locator("canvas")).toHaveAttribute("data-frame", "0");
    const difference = await root(page).evaluate((host) => {
      const canvas = host.querySelector("canvas")!;
      const img = host.querySelector("img")!;
      // The poster as the page shows it (object-fit: cover, centred), at the canvas's size.
      const poster = document.createElement("canvas");
      poster.width = canvas.width;
      poster.height = canvas.height;
      const scale = Math.max(poster.width / img.naturalWidth, poster.height / img.naturalHeight);
      const [width, height] = [img.naturalWidth * scale, img.naturalHeight * scale];
      poster.getContext("2d")!.drawImage(img, (poster.width - width) / 2, (poster.height - height) / 2, width, height);
      const a = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const b = poster.getContext("2d")!.getImageData(0, 0, poster.width, poster.height).data;
      let total = 0;
      for (let i = 0; i < a.length; i += 4) total += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      return { mean: total / (a.length / 4) / 3, src: img.currentSrc };
    });
    expect(difference.src).toMatch(/\/00\.webp$/);
    expect(difference.mean).toBeLessThan(1);
  });

  test("while frames are on their way, the nearest one that has come holds, and the one wanted follows", async ({ page, isMobile }) => {
    const { count: COUNT, last: LAST, keys: KEYS } = sequenceOf(isMobile);
    // Every frame passes through the test's own request handler, which a busy machine makes slow.
    test.slow();
    // Only every fourth frame and the last arrive; the rest wait until released.
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(FRAME, async (route) => {
      const index = Number(FRAME.exec(route.request().url())![2]);
      // (The first frame, which settles the format, is a key frame.)
      if (route.request().resourceType() === "fetch" && !KEYS.includes(index)) await gate;
      await route.continue();
    });
    await open(page);
    const top = await settledTop(page, 0.6);
    await expect.poll(() => root(page).evaluate((element) => Number(element.dataset.sgLoaded ?? 0)), { timeout: 20_000 }).toBe(KEYS.length);
    const run = await runOf(page);
    const stop = await record(page);
    // Halfway and a little: frame 31 is wanted, 28 is the nearest that came on the way there. Each held frame is
    // drawn whole: frames four apart are not mixed.
    const target = LAST / 2 + 1;
    await scrollTo(page, top + run * (target / LAST));
    await page.waitForTimeout(400);
    const waiting = (await stop()).map((sample) => sample.frame).filter((frame) => frame >= 0);
    expect(waiting.every((frame) => KEYS.includes(frame))).toBe(true);
    for (let i = 1; i < waiting.length; i++) expect(waiting[i]).toBeGreaterThanOrEqual(waiting[i - 1]);
    expect(waiting[waiting.length - 1]).toBe(Math.floor(target / 4) * 4);
    // The rest arrive: the wanted frame is drawn without another scroll.
    release();
    await expect(root(page)).toHaveAttribute("data-sg-loaded", String(COUNT), { timeout: 60_000 });
    await expectFrame(page, target);
  });

  test("the frames are fetched and decoded in a worker, never on the page's main thread", async ({ page }) => {
    const workers: string[] = [];
    page.on("worker", (worker) => workers.push(worker.url()));
    const here: string[] = [];
    page.on("request", (request) => /\/sequence-loader-[^/]*\.js$/.test(request.url()) && here.push(request.url()));
    await open(page);
    await settledTop(page, 0.6);
    await expect(root(page)).toHaveAttribute("data-sg-state", "live", { timeout: 20_000 });
    expect(workers.filter((url) => /sequence-worker/.test(url))).toHaveLength(1);
    // The main thread's copy of the loader is never fetched.
    expect(here).toEqual([]);
  });

  test("where no worker can start, the page fetches and decodes them itself, and the sequence runs the same", async ({ page, isMobile }) => {
    const { count: COUNT, last: LAST } = sequenceOf(isMobile);
    await page.addInitScript(() => Object.defineProperty(window, "Worker", { value: undefined }));
    const errors = collectErrors(page);
    const here: string[] = [];
    page.on("request", (request) => /\/sequence-loader-[^/]*\.js$/.test(request.url()) && here.push(request.url()));
    await open(page);
    const top = await settledTop(page, 0.6);
    await expect(root(page)).toHaveAttribute("data-sg-loaded", String(COUNT), { timeout: 30_000 });
    await expect(root(page)).toHaveAttribute("data-sg-state", "live");
    expect(here).toHaveLength(1);
    const run = await runOf(page);
    await scrollTo(page, top + run * 0.5);
    await expectFrame(page, LAST / 2);
    expect(errors).toEqual([]);
  });

  test("between two frames the canvas shows both, the later as strong as the scroll is far into the step, so a slow scroll moves on every painted frame", async ({ page, isMobile }) => {
    const { count: COUNT, last: LAST, file } = sequenceOf(isMobile);
    test.slow();
    const errors = collectErrors(page);
    await open(page);
    const top = await settledTop(page, 0.6);
    await expect(root(page)).toHaveAttribute("data-sg-loaded", String(COUNT), { timeout: 30_000 });
    const run = await runOf(page);
    const perFrame = run / LAST;

    // Held between frames 40 and 41: what the canvas shows is the two pictures mixed by the same share, drawn here again from the files.
    await scrollTo(page, top + perFrame * 40.5);
    await expect.poll(async () => Math.abs((await shown(page)) - 40.5)).toBeLessThan(0.1);
    const mixed = await root(page).evaluate(async (host, files) => {
      const canvas = host.querySelector("canvas")!;
      const position = Number(canvas.dataset.frame);
      const [under, over] = await Promise.all(files.map(async (file) => createImageBitmap(await (await fetch(`../sekvens/${file}`)).blob())));
      const picture = (strengths: number[]) => {
        const own = document.createElement("canvas");
        own.width = canvas.width;
        own.height = canvas.height;
        const context = own.getContext("2d", { alpha: false })!;
        [under, over].forEach((bitmap, index) => {
          const scale = Math.max(own.width / bitmap.width, own.height / bitmap.height);
          const [width, height] = [bitmap.width * scale, bitmap.height * scale];
          context.globalAlpha = strengths[index];
          context.drawImage(bitmap, (own.width - width) / 2, (own.height - height) / 2, width, height);
        });
        return context.getImageData(0, 0, own.width, own.height).data;
      };
      const drawn = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const [under40, over41] = [picture([1, 0]), picture([0, 1])];
      const apart = (a: Uint8ClampedArray, b: Uint8ClampedArray, i: number) => Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      // Judged where the band moved between the two pictures; the backdrop is the same in both.
      const moved: number[] = [];
      for (let i = 0; i < drawn.length; i += 4) if (apart(under40, over41, i) > 45) moved.push(i);
      const difference = (other: Uint8ClampedArray) => moved.reduce((total, i) => total + apart(drawn, other, i), 0) / moved.length / 3;
      return { position, moved: moved.length, both: difference(picture([1, position - 40])), under: difference(under40), over: difference(over41) };
    }, [file(40), file(41)]);
    // It is the mix, and neither picture alone.
    expect(mixed.moved).toBeGreaterThan(500);
    expect(mixed.both).toBeLessThan(mixed.under / 3);
    expect(mixed.both).toBeLessThan(mixed.over / 3);

    // A slow scroll, two pixels at a time over four frames' distance: the picture moves with almost every step of
    // the scroll, where whole frames alone would change four times.
    const stop = await record(page);
    await scrollTo(page, top + perFrame * 44.5, 2);
    await page.waitForTimeout(200);
    const slow = (await stop()).filter((sample) => sample.frame >= 0);
    const positions = new Set(slow.map((sample) => sample.frame)).size;
    const scrolls = new Set(slow.map((sample) => sample.y)).size;
    expect(scrolls).toBeGreaterThan(8);
    expect(positions).toBeGreaterThan(scrolls * 0.7);
    for (let i = 1; i < slow.length; i++) expect(slow[i].frame).toBeGreaterThanOrEqual(slow[i - 1].frame);
    expect(jumps(slow, perFrame)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test("nothing shifts as it loads, takes over, runs and lets go", async ({ page }) => {
    test.slow();
    await open(page);
    const top = await settledTop(page, 2.5);
    await page.evaluate(() => {
      const shifts: number[] = [];
      (window as unknown as { sgShifts: number[] }).sgShifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) shifts.push(entry.value);
      }).observe({ type: "layout-shift" });
    });
    const height = await page.evaluate(() => innerHeight);
    const track = await root(page).evaluate((element) => element.getBoundingClientRect().height);
    // In from above (the chunk loads and the canvas takes over), down through it to the footer, and back.
    await scrollTo(page, top + track, 60);
    await scrollTo(page, top - height, 60);
    await page.waitForTimeout(300);
    const shifts = await page.evaluate(() => (window as unknown as { sgShifts: number[] }).sgShifts);
    expect(shifts.reduce((sum, value) => sum + value, 0)).toBeLessThan(0.001);
  });

  test("the held stage never traps the keyboard: Page Down goes on through it to the footer, and focus is never covered", async ({ page, isMobile }) => {
    const { last: LAST } = sequenceOf(isMobile);
    await open(page);
    const top = await settledTop(page, 0);
    await expect(root(page)).toHaveAttribute("data-sg-state", "live", { timeout: 20_000 });
    // Nothing in it takes focus: the canvas is hidden from screen readers, and the stage is no stop on the way.
    await expect(root(page).locator("canvas")).toHaveAttribute("aria-hidden", "true");
    expect(await root(page).locator("a, button, [tabindex]").count()).toBe(0);
    const footer = page.locator("footer");
    let before = await page.evaluate(() => scrollY);
    for (let press = 0; press < 12 && !(await footer.evaluate((element) => element.getBoundingClientRect().top < innerHeight)); press++) {
      await page.keyboard.press("PageDown");
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
      await page.waitForTimeout(250);
      before = await page.evaluate(() => scrollY);
    }
    await expect.poll(() => footer.evaluate((element) => element.getBoundingClientRect().top < innerHeight)).toBe(true);
    expect(before).toBeGreaterThan(top);
    await expect(root(page).locator("canvas")).toHaveAttribute("data-frame", String(LAST));

    // Tabbing from the section's heading goes past it to the footer's link, shown and uncovered; and back.
    await page.locator("#sequence-title").evaluate((element) => {
      element.setAttribute("tabindex", "-1");
      element.focus();
    });
    await page.keyboard.press("Tab");
    const back = page.getByRole("link", { name: "Tillbaka till början" });
    await expect(back).toBeFocused();
    const uncovered = () =>
      page.evaluate(() => {
        const focused = document.activeElement as HTMLElement;
        const box = focused.getBoundingClientRect();
        if (box.bottom <= 0 || box.top >= innerHeight) return "off screen";
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        return hit && focused.contains(hit) ? "ok" : `covered by ${hit?.tagName}`;
      });
    await expect.poll(uncovered, { timeout: 3000 }).toBe("ok");
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByRole("link", { name: "Se hantverket" })).toBeFocused();
    await expect.poll(uncovered, { timeout: 3000 }).toBe("ok");
  });

  test("nothing scrolls sideways at any point of it", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    const top = await settledTop(page, 1);
    const height = await page.evaluate(() => innerHeight);
    for (const at of [-0.5, 0, 0.7, 1.4, 2.1, 2.8]) {
      await scrollTo(page, top + at * height, 200);
      await page.waitForTimeout(150);
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    }
    expect(errors).toEqual([]);
  });
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`no accessibility errors in the sequence (${motion === "reduce" ? "reduced motion" : "motion, held halfway"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await open(page);
    const top = await settledTop(page, 0.5);
    if (motion === "no-preference") {
      await expect(root(page)).toHaveAttribute("data-sg-state", "live", { timeout: 20_000 });
      const height = await page.evaluate(() => innerHeight);
      await scrollTo(page, top + height, 200);
    } else await expect(root(page)).toHaveAttribute("data-sg-state", "still");
    await page.waitForTimeout(300);
    const results = await new AxeBuilder({ page }).include(".sequence").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
