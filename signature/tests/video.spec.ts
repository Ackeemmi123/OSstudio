import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The video block (`data-sg="video"`) on the library: a loop made in code that
 * plays only while it is seen, never by itself with reduced motion, not at all
 * with Save-Data, and with the browser's own controls without JavaScript.
 */

const PAGE = "/bibliotek/";
const FILM = /\.(webm|mp4)(\?|$)/;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Scrolls so the film's track starts `offset` screens below the top of the screen (negative: above), as a visitor would get there. */
async function toFilm(page: Page, offset = 0.1) {
  // Sections above pin and grow as the engine reaches them, so the place is measured again until it holds.
  for (let round = 0; round < 4; round++) {
    await page.evaluate((offset) => {
      const film = document.querySelector('[data-sg="video"]')!;
      window.scrollTo(0, film.getBoundingClientRect().top + window.scrollY - offset * window.innerHeight);
    }, offset);
    await page.waitForTimeout(350);
  }
}

const paused = (page: Page) => page.locator('[data-sg="video"] video').evaluate((video: HTMLVideoElement) => video.paused);
const time = (page: Page) => page.locator('[data-sg="video"] video').evaluate((video: HTMLVideoElement) => video.currentTime);

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the film has the browser's own controls over its picture, and nothing is fetched until asked", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(PAGE);
    const video = page.locator('[data-sg="video"] video');
    await video.scrollIntoViewIfNeeded();
    await expect(video).toHaveAttribute("controls", "");
    await expect(video).toHaveAttribute("preload", "none");
    // Its own poster, so the browser never shows an empty grey film under its controls.
    await expect(video).toHaveAttribute("poster", /bandet-film-800/);
    await expect(video).toBeVisible();
    const poster = page.locator('[data-sg="video"] img');
    await expect(poster).toBeVisible();
    await expect.poll(() => poster.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // The engine's own button needs the engine.
    await expect(page.locator("[data-sg-toggle]")).toBeHidden();
    expect(requests.filter((url) => FILM.test(url))).toEqual([]);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the film never starts by itself; the button plays and pauses it from the keyboard, and says which", async ({ page }) => {
    const errors = collectErrors(page);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(PAGE);
    await toFilm(page, 0.2);
    const root = page.locator('[data-sg="video"]');
    await expect(root).toHaveAttribute("data-sg-state", "ready");
    // The plain frame: no tall track, nothing held on screen.
    await expect(root.locator("[data-sg-frame]")).toHaveCSS("position", "relative");
    const play = page.getByRole("button", { name: "Spela film" });
    await expect(play).toBeVisible();
    await expect(root.locator("video")).not.toHaveAttribute("controls", "");
    await page.waitForTimeout(1200);
    expect(await paused(page)).toBe(true);
    expect(requests.filter((url) => FILM.test(url))).toEqual([]);

    // Keyboard: focus the button and press Enter, then Space.
    await play.focus();
    await page.keyboard.press("Enter");
    const pause = page.getByRole("button", { name: "Pausa film" });
    await expect(pause).toBeFocused();
    await expect.poll(() => time(page), { timeout: 10_000 }).toBeGreaterThan(0.3);
    expect(await paused(page)).toBe(false);
    await expect(root).toHaveAttribute("data-sg-state", "live");
    await page.keyboard.press("Space");
    await expect(page.getByRole("button", { name: "Spela film" })).toBeFocused();
    expect(await paused(page)).toBe(true);
    expect(errors).toEqual([]);
  });
});

test.describe("with motion", () => {
  test("the film loads only as it comes near, plays while it is seen and the tab is visible, and pauses otherwise", async ({ page, isMobile }) => {
    const errors = collectErrors(page);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(PAGE);
    await page.waitForTimeout(800);
    expect(requests.filter((url) => FILM.test(url))).toEqual([]);

    await toFilm(page, 0);
    await expect.poll(() => time(page), { timeout: 10_000 }).toBeGreaterThan(0.3);
    expect(await paused(page)).toBe(false);
    // The pause button is on the film the whole time it runs (WCAG 2.2.2).
    await expect(page.getByRole("button", { name: "Pausa film" })).toBeInViewport();
    // One film, the one this screen needs: tall for phones, wide otherwise.
    const fetched = requests.filter((url) => FILM.test(url));
    expect(fetched.length).toBeGreaterThan(0);
    expect(fetched.every((url) => (isMobile ? /telefon-720/ : /bandet-1280/).test(url))).toBe(true);

    // A hidden tab pauses it; back again, it runs on.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await paused(page)).toBe(true);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => paused(page)).toBe(false);

    // Scrolled away: paused.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => paused(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("paused with the button, it stays paused when it comes back into view", async ({ page }) => {
    await page.goto(PAGE);
    await toFilm(page, 0);
    await expect.poll(() => time(page), { timeout: 10_000 }).toBeGreaterThan(0.2);
    await page.getByRole("button", { name: "Pausa film" }).click();
    expect(await paused(page)).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    await toFilm(page, 0);
    await page.waitForTimeout(800);
    expect(await paused(page)).toBe(true);
    await expect(page.getByRole("button", { name: "Spela film" })).toBeVisible();
  });

  test("the showreel grows from its frame to the whole screen as it scrolls, by clip and scale only", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(PAGE);
    const frame = page.locator('[data-sg="video"] [data-sg-frame]');
    const grow = () => frame.evaluate((element) => Number(getComputedStyle(element).getPropertyValue("--sg-grow") || 0));
    await toFilm(page, 0.5);
    await expect.poll(grow, { timeout: 10_000 }).toBe(0);
    await expect(frame).toHaveCSS("position", "sticky");
    // Framed: clipped inside the screen on every side.
    const framed = await frame.evaluate((element) => getComputedStyle(element).clipPath);
    expect(framed).toMatch(/^inset\(\d/);
    expect(framed).not.toBe("inset(0px)");
    // A screen further on, it fills the screen: no clip, full size, held in place.
    await toFilm(page, -1);
    await expect.poll(grow).toBe(1);
    await expect(frame).toHaveCSS("clip-path", "inset(0px)");
    await expect(frame.locator("[data-sg-media]")).toHaveCSS("scale", "1");
    const box = (await frame.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
    expect(box.height).toBeGreaterThanOrEqual(viewport.height * 0.85);
    // Halfway, both are on their way.
    await toFilm(page, -0.2);
    const half = await grow();
    expect(half).toBeGreaterThan(0.2);
    expect(half).toBeLessThan(0.8);
    expect(errors).toEqual([]);
  });
});

test.describe("with Save-Data", () => {
  test.use({ extraHTTPHeaders: { "Save-Data": "on" } });

  test("the picture is the film: no button, nothing fetched", async ({ page }) => {
    // Chrome sends this header and sets navigator.connection.saveData from the same setting; Playwright cannot turn that
    // setting on, so the header is sent and the property the engine reads is set to what Chrome would report.
    await page.addInitScript(() => {
      const connection = (navigator as Navigator & { connection?: object }).connection;
      if (connection) Object.defineProperty(connection, "saveData", { get: () => true });
      else Object.defineProperty(navigator, "connection", { get: () => ({ saveData: true }) });
    });
    const errors = collectErrors(page);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(PAGE);
    await toFilm(page, 0);
    const root = page.locator('[data-sg="video"]');
    await expect(root).toHaveAttribute("data-sg-state", "poster");
    await page.waitForTimeout(1500);
    await expect(root.locator("video")).toBeHidden();
    await expect(root.locator("[data-sg-toggle]")).toBeHidden();
    await expect(root.getByRole("img", { name: "Metallbandet vrider sig ett varv, en slinga renderad i kod" })).toBeVisible();
    expect(requests.filter((url) => FILM.test(url))).toEqual([]);
    expect(errors).toEqual([]);
  });
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`no accessibility errors on the film (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(PAGE);
    await toFilm(page, motion === "reduce" ? 0.2 : 0);
    await expect(page.locator('[data-sg="video"]')).toHaveAttribute("data-sg-state", /ready|live/);
    await page.waitForTimeout(800);
    const results = await new AxeBuilder({ page }).include(".film").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("the film does not make the page scroll sideways, at any point of its growth", async ({ page }) => {
  await page.goto(PAGE);
  for (const offset of [0.5, 0, -0.5, -1.1, -1.6]) {
    await toFilm(page, offset);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
});
