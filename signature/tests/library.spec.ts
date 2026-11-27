import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { handedToWorker, mainContexts, watchCanvases, withoutOffscreenCanvas, withoutWebGL } from "./webgl";

/** The library's building blocks keep the same rules as the lab: content first, motion on top. */

const PAGE = "/bibliotek/";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Scrolls the way a hand does, in small steps, so scroll listeners and scroll-driven animations see every stage. */
async function scrollTo(page: Page, target: number, step = 40) {
  let at = await page.evaluate(() => scrollY);
  const direction = Math.sign(target - at);
  while (Math.abs(target - at) > 1) {
    at = direction > 0 ? Math.min(target, at + step) : Math.max(target, at - step);
    await page.evaluate((y) => window.scrollTo(0, y), at);
    await page.waitForTimeout(16);
  }
}

/** Every layout shift a visitor's CLS would count (none excused by recent input), from the page's start. */
async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; nodes: string[] }[] = [];
    (window as unknown as { sgShifts: typeof shifts }).sgShifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean; sources: { node: Node | null }[] }>) {
        if (!entry.hadRecentInput) shifts.push({ value: entry.value, nodes: entry.sources.map((source) => (source.node instanceof Element ? source.node.className : String(source.node))) });
      }
    }).observe({ type: "layout-shift" });
  });
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("every block shows its content: four story panels, the band's picture, one ticker line, the word mark, the pictures", async ({ page }) => {
    await page.goto(PAGE);
    // The story's own panels (the stack in 11 tells the same steps; tests/stack-cta.spec.ts covers it).
    for (const title of ["Brief och idé", "Innehåll i Studio OS", "Rörelse och hantverk", "Granskning och lansering"]) {
      await expect(page.locator(".story").getByRole("heading", { level: 3, name: title })).toBeVisible();
    }
    await expect(page.getByRole("img", { name: "Ett band av borstad metall i en Möbiusslinga mot en mörkblå bakgrund, renderat i 3D" })).toBeVisible();
    await expect(page.locator("[data-sg-line]")).toHaveCount(1);
    await expect(page.locator(".foot-word .sg-sr")).toHaveText("axivo");
    // The image effect is the picture itself; the gallery is a list of six that scrolls on its own.
    await expect(page.getByRole("img", { name: "Lila siden i mjuka veck med ljus i vecken" }).first()).toBeVisible();
    await expect(page.locator(".gallery-slide")).toHaveCount(6);
    await expect(page.getByRole("list", { name: "Galleri, sex bilder" })).toBeVisible();
    // Controls that need a script are not shown without one.
    await expect(page.locator("[data-sg-controls]")).toBeHidden();
    await expect(page.getByRole("button", { name: "Ljud" })).toBeHidden();
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves: no ticker copies, no horizontal story, no 3D, no cursor", async ({ page }) => {
    const errors = collectErrors(page);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${PAGE}?webgl`);
    await page.waitForLoadState("load");
    await page.mouse.move(300, 300);
    for (const selector of [".ticker", ".story", ".object", ".reveal-band", ".gallery", ".signature-foot"]) {
      await page.locator(selector).scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }
    await expect(page.locator(".sg-marquee-copy")).toHaveCount(0);
    // The pictures are just pictures; the gallery's buttons still work, without gliding.
    for (const frame of await page.locator('[data-sg="reveal"]').all()) await expect(frame).not.toHaveClass(/is-live/);
    await page.getByRole("button", { name: "Nästa bild" }).click();
    await expect(page.locator("[data-sg-count]")).toHaveText("02 / 06");
    await expect(page.locator(".story")).not.toHaveClass(/is-horizontal/);
    await expect(page.locator(".object")).toHaveAttribute("data-sg-state", "still");
    await expect(page.locator(".sg-cursor")).toHaveCount(0);
    expect(requests.some((url) => url.includes("band-scene"))).toBe(false);
    // Nothing keeps running: a short fade (the call to action showing as the click scrolled up) may finish, anything that loops never does.
    await expect.poll(() => page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length), { timeout: 2000 }).toBe(0);
    expect(errors).toEqual([]);
  });
});

test.describe("with motion", () => {
  test("the ticker runs, and screen readers get its text once", async ({ page }) => {
    await page.goto(PAGE);
    await page.locator(".ticker").scrollIntoViewIfNeeded();
    await expect(page.locator(".ticker")).toHaveClass(/is-running/);
    const copies = page.locator(".sg-marquee-copy");
    expect(await copies.count()).toBeGreaterThan(0);
    for (const copy of await copies.all()) await expect(copy).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("paragraph").filter({ hasText: "Idé · Rörelse · Hantverk" })).toHaveCount(1);
  });

  test("on wide screens the story slides sideways, and a keyboard user is taken to the panel they tab into", async ({ page, isMobile }) => {
    test.skip(isMobile, "Phones get the stacked panels.");
    await page.goto(PAGE);
    const story = page.locator(".story");
    await story.scrollIntoViewIfNeeded();
    await expect(story).toHaveClass(/is-horizontal/);
    const track = page.locator(".story [data-sg-track]");
    const before = await track.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41);
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(1500);
    const after = await track.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41);
    expect(after).toBeLessThan(before - 100);
    // Tab to the link in the last panel: the page scrolls so that panel is on screen.
    await page.evaluate(() => window.scrollTo(0, (document.querySelector(".story") as HTMLElement).offsetTop - 200));
    await page.waitForTimeout(600);
    await page.locator(".story-link").focus();
    await page.waitForTimeout(1200);
    const box = await page.locator(".story-panel").last().boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  test("the story holds still while its panels slide, and nothing shifts scrolling through it down and back up", async ({ page, isMobile }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => sessionStorage.setItem("sg-intro", "1"));
    await watchShifts(page);
    await page.goto(PAGE);
    const story = page.locator(".story");
    const height = page.viewportSize()!.height;
    await scrollTo(page, (await story.evaluate((element) => element.getBoundingClientRect().top + scrollY)) - height, 300);
    if (!isMobile) await expect(story).toHaveClass(/is-horizontal/);
    await page.waitForTimeout(500);
    const from = await page.evaluate(() => scrollY);
    // Every frame: the scroll, where the heading is on screen, and how far the panels have slid.
    await page.evaluate(() => {
      const frames: { y: number; heading: number; x: number }[] = [];
      (window as unknown as { sgFrames: typeof frames }).sgFrames = frames;
      const heading = document.querySelector(".story .label")!;
      const track = document.querySelector(".story [data-sg-track]")!;
      const record = () => {
        frames.push({ y: scrollY, heading: heading.getBoundingClientRect().top, x: new DOMMatrix(getComputedStyle(track).transform).m41 });
        requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
      (window as unknown as { sgShifts: unknown[] }).sgShifts.length = 0;
    });
    // Where the section holds: from its top at the top of the screen for as long as it is taller than what it shows.
    const hold = await story.evaluate((element: HTMLElement) => {
      const top = element.getBoundingClientRect().top + scrollY;
      const shown = (element.querySelector(".story-hold") ?? element) as HTMLElement;
      return { from: top, to: top + element.offsetHeight - shown.offsetHeight };
    });
    const end = await story.evaluate((element) => element.getBoundingClientRect().bottom + scrollY);
    await scrollTo(page, end);
    await page.waitForTimeout(1200);
    await scrollTo(page, from);
    await page.waitForTimeout(600);
    const { shifts, frames } = await page.evaluate(() => {
      const w = window as unknown as { sgShifts: { value: number; nodes: string[] }[]; sgFrames: { y: number; heading: number; x: number }[] };
      return { shifts: w.sgShifts, frames: w.sgFrames };
    });
    expect(shifts.reduce((sum, shift) => sum + shift.value, 0), JSON.stringify(shifts)).toBeLessThan(0.01);
    if (isMobile) return;
    // The panels slid a long way, and all the while the section held, its heading stayed in one place.
    expect(hold.to - hold.from).toBeGreaterThan(300);
    expect(Math.min(...frames.map((f) => f.x))).toBeLessThan(-300);
    const held = frames.filter((f) => f.y >= hold.from + 2 && f.y <= hold.to - 2).map((f) => Math.round(f.heading));
    expect(held.length).toBeGreaterThan(10);
    expect(Math.max(...held) - Math.min(...held)).toBeLessThanOrEqual(1);
  });

  test("the band comes together as the steps scroll past, drawn in 3D when WebGL is good", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${PAGE}?webgl`);
    const object = page.locator(".object");
    await object.scrollIntoViewIfNeeded();
    await expect(object).toHaveAttribute("data-sg-state", "webgl", { timeout: 15_000 });
    await expect(page.locator(".object-stage")).toHaveClass(/is-live/);
    await page.evaluate(() => document.querySelectorAll(".object-steps li")[2].scrollIntoView({ block: "center" }));
    await expect.poll(async () => Number(await object.getAttribute("data-sg-progress")), { timeout: 5000 }).toBeGreaterThan(0.95);
    await expect(page.locator(".object-steps li").nth(2)).toHaveAttribute("data-active", "");
    expect(errors).toEqual([]);
  });

  test("without WebGL the band stays a picture", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    // No WebGL on the main thread nor in the worker.
    await withoutWebGL(page);
    await watchCanvases(page);
    await page.goto(`${PAGE}?webgl`);
    await page.locator(".object").scrollIntoViewIfNeeded();
    // The band is tried in its worker, which finds no WebGL.
    await expect.poll(() => page.locator(".object-stage canvas").evaluate(handedToWorker), { timeout: 15_000 }).toBe(true);
    await page.waitForTimeout(1500);
    await expect(page.locator(".object")).toHaveAttribute("data-sg-state", "still");
    await expect(page.getByRole("img", { name: "Ett band av borstad metall i en Möbiusslinga mot en mörkblå bakgrund, renderat i 3D" })).toBeVisible();
    // The 3D chunk may be fetched to try, but nothing draws; the picture stays the design.
    await expect(page.locator(".object-stage")).not.toHaveClass(/is-live/);
    expect(requests.some((url) => url.includes("band-worker"))).toBe(true);
  });

  test("the band and the pictures draw in workers, and the band still reports its quality", async ({ page }) => {
    // Two WebGL modules and a frame-time window: on a software renderer this takes a while.
    test.slow();
    const errors = collectErrors(page);
    await watchCanvases(page);
    await page.goto(`${PAGE}?webgl`);
    const object = page.locator(".object");
    await object.scrollIntoViewIfNeeded();
    await expect(page.locator(".object-stage")).toHaveClass(/is-live/, { timeout: 15_000 });
    const canvas = page.locator(".object-stage canvas");
    expect(await canvas.evaluate(handedToWorker)).toBe(true);
    // What the band measures comes back from the worker.
    await expect(canvas).toHaveAttribute("data-quality", /^[012]$/);
    await expect(canvas).toHaveAttribute("data-frame-budget", /^\d+\.\d$/);
    await expect(canvas).toHaveAttribute("data-frame-p75", /^\d+\.\d$/, { timeout: 15_000 });
    await page.locator(".reveal-band").scrollIntoViewIfNeeded();
    const frame = page.locator('[data-sg="reveal"]').first();
    await expect(frame).toHaveClass(/is-live/, { timeout: 15_000 });
    expect(await frame.locator("canvas").evaluate(handedToWorker)).toBe(true);
    expect(await page.evaluate(mainContexts)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("without OffscreenCanvas, the band and the pictures draw on the main thread, as before", async ({ page }) => {
    const errors = collectErrors(page);
    await withoutOffscreenCanvas(page);
    await watchCanvases(page);
    await page.goto(`${PAGE}?webgl`);
    await page.locator(".object").scrollIntoViewIfNeeded();
    await expect(page.locator(".object-stage")).toHaveClass(/is-live/, { timeout: 15_000 });
    await expect(page.locator(".object-stage canvas")).toHaveAttribute("data-quality", /^[012]$/);
    await page.locator(".reveal-band").scrollIntoViewIfNeeded();
    await expect(page.locator('[data-sg="reveal"]').first()).toHaveClass(/is-live/, { timeout: 15_000 });
    expect(await page.evaluate(mainContexts)).toBeGreaterThanOrEqual(2);
    expect(errors).toEqual([]);
  });

  test("with a mouse, a ring follows the pointer and the buttons lean toward it, never far", async ({ page, isMobile }) => {
    test.skip(isMobile, "Touch screens get no cursor companion.");
    await page.goto(PAGE);
    await page.locator(".magnets").scrollIntoViewIfNeeded();
    await page.mouse.move(200, 200);
    await expect(page.locator(".sg-cursor")).toHaveAttribute("aria-hidden", "true");
    const pill = page.locator(".magnets .pill").first();
    const box = (await pill.boundingBox())!;
    await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2, { steps: 10 });
    await page.waitForTimeout(900);
    const shift = await pill.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41);
    expect(shift).toBeGreaterThan(2);
    expect(shift).toBeLessThanOrEqual(14.5);
  });

  test("the image effect draws each picture over the real one, which stays for screen readers", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(`${PAGE}?webgl`);
    const band = page.locator(".reveal-band");
    await band.scrollIntoViewIfNeeded();
    const frame = page.locator('[data-sg="reveal"]').first();
    await expect(frame).toHaveAttribute("data-sg-state", "webgl", { timeout: 15_000 });
    await expect(frame).toHaveClass(/is-live/);
    await expect(frame.getByRole("img", { name: "Lila siden i mjuka veck med ljus i vecken" })).toBeAttached();
    await expect(frame.locator("canvas")).toHaveAttribute("aria-hidden", "true");
    expect(errors).toEqual([]);
  });

  for (const way of ["straight to the pictures", "down through the page"] as const) {
    test(`a picture that has shown never vanishes before it arrives, nor waits long on screen (${way})`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.addInitScript(() => {
        sessionStorage.setItem("sg-intro", "1");
        // Every frame, for every picture: on screen, its <img> showing, the shader's copy on, and where it stands.
        const frames: { t: number; on: boolean; img: boolean; live: boolean; phase: string }[][] = [];
        (window as unknown as { sgPictures: typeof frames }).sgPictures = frames;
        const record = (t: number) => {
          frames.push(
            [...document.querySelectorAll<HTMLElement>('[data-sg="reveal"]')].map((frame) => {
              const box = frame.getBoundingClientRect();
              const img = frame.querySelector("img")!;
              return {
                t,
                on: box.bottom > 0 && box.top < innerHeight,
                img: img.complete && img.naturalWidth > 0 && getComputedStyle(img).opacity === "1",
                live: frame.classList.contains("is-live"),
                phase: frame.dataset.sgPicture ?? "",
              };
            }),
          );
          requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      });
      await page.goto(`${PAGE}?webgl`);
      const band = page.locator(".reveal-band");
      const top = await band.evaluate((element) => element.getBoundingClientRect().top + scrollY);
      if (way === "straight to the pictures") await page.evaluate((y) => window.scrollTo(0, y), top - 100);
      else await scrollTo(page, top - 100, 60);
      await page.waitForTimeout(2500);
      // On, until the last picture is past the top of the screen.
      await scrollTo(page, await band.evaluate((element) => element.getBoundingClientRect().bottom + scrollY - 100), 40);
      await page.waitForTimeout(2500);
      const frames = await page.evaluate(() => (window as unknown as { sgPictures: { t: number; on: boolean; img: boolean; live: boolean; phase: string }[][] }).sgPictures);
      const pictures = frames[0].length;
      expect(pictures).toBeGreaterThan(0);
      let showed = 0;
      for (let i = 0; i < pictures; i++) {
        const own = frames.map((frame) => frame[i]);
        // Once its <img> has shown on screen, it shows in every later frame.
        const first = own.findIndex((f) => f.on && f.img);
        if (first >= 0) {
          showed++;
          const hidden = own.slice(first).findIndex((f) => !f.img);
          expect(hidden, `picture ${i + 1} vanished ${hidden} frames after it showed (${JSON.stringify(own[first + hidden])})`).toBe(-1);
        }
        // Held back to arrive, it never stands empty on screen for long while the shader is not drawing.
        let since = -1;
        for (const f of own) {
          const empty = f.on && !f.img && !f.live;
          if (empty && since < 0) since = f.t;
          if (!empty) since = -1;
          expect(since < 0 || f.t - since < 1200, `picture ${i + 1} stood empty on screen from ${Math.round(since)} ms`).toBe(true);
        }
        // It ends shown.
        expect(own.at(-1)!.phase, `picture ${i + 1} ends ${JSON.stringify(own.at(-1))}`).toBe("shown");
      }
      expect(showed).toBeGreaterThan(0);
    });
  }

  test("the gallery steps one picture at a time, and the counter and buttons follow", async ({ page }) => {
    await page.goto(PAGE);
    const gallery = page.locator(".gallery");
    await gallery.scrollIntoViewIfNeeded();
    await expect(gallery).toHaveClass(/is-ready/);
    const previous = page.getByRole("button", { name: "Föregående bild" });
    const next = page.getByRole("button", { name: "Nästa bild" });
    const count = page.locator("[data-sg-count]");
    await expect(count).toHaveText("01 / 06");
    await expect(previous).toHaveAttribute("aria-disabled", "true");
    await next.click();
    await expect(count).toHaveText("02 / 06");
    await expect(previous).toHaveAttribute("aria-disabled", "false");
    await previous.click();
    await expect(count).toHaveText("01 / 06");
    // The row itself takes the keyboard: focus it and use the arrow keys.
    const track = page.locator(".gallery [data-sg-track]");
    await track.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => track.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  });

  test("with a mouse, the gallery can be thrown, and lands on a picture", async ({ page, isMobile }) => {
    test.skip(isMobile, "Touch scrolls the row natively.");
    await page.goto(PAGE);
    const track = page.locator(".gallery-track");
    await track.scrollIntoViewIfNeeded();
    await expect(page.locator(".gallery")).toHaveClass(/is-ready/);
    const box = (await track.boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.8, y);
    await page.mouse.down();
    for (let step = 1; step <= 8; step++) await page.mouse.move(box.x + box.width * 0.8 - step * 50, y);
    await page.mouse.up();
    await expect(page.locator(".gallery")).not.toHaveClass(/is-dragging/, { timeout: 3000 });
    // At rest on a snap point: some picture's left edge lines up with the row's start.
    const landed = await track.evaluate((element: HTMLElement) => {
      const inset = Number.parseFloat(getComputedStyle(element).scrollPaddingInlineStart) || 0;
      const max = element.scrollWidth - element.clientWidth;
      const stops = [...element.querySelectorAll<HTMLElement>("[data-sg-slide]")].map((slide) => Math.min(max, slide.offsetLeft - element.offsetLeft - inset));
      return { left: element.scrollLeft, near: Math.min(...stops.map((stop) => Math.abs(stop - element.scrollLeft))) };
    });
    expect(landed.left).toBeGreaterThan(0);
    expect(landed.near).toBeLessThanOrEqual(2);
  });

  test("sound is off until asked for, remembered, and waits for a click before it plays again", async ({ page }) => {
    await page.goto(PAGE);
    const sound = page.getByRole("button", { name: "Ljud" });
    await expect(sound).toBeVisible({ timeout: 10_000 });
    await expect(sound).toHaveAttribute("aria-pressed", "false");
    await sound.click();
    await expect(sound).toHaveAttribute("aria-pressed", "true");
    await expect(sound).toHaveClass(/is-playing/);
    expect(await page.evaluate(() => localStorage.getItem("sg-sound"))).toBe("on");
    // Next visit: remembered as on, but silent until the visitor does something.
    await page.reload();
    await expect(sound).toHaveAttribute("aria-pressed", "true", { timeout: 10_000 });
    await expect(sound).not.toHaveClass(/is-playing/);
    await page.locator(".library-lead").click();
    await expect(sound).toHaveClass(/is-playing/);
    await sound.click();
    await expect(sound).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("sg-sound"))).toBe("off");
  });
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`no accessibility errors on the library (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(PAGE);
    await page.waitForTimeout(2500);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("the library does not scroll sideways", async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForTimeout(800);
  for (const selector of [".ticker", ".story", ".object", ".reveal-band", ".gallery", ".signature-foot"]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
