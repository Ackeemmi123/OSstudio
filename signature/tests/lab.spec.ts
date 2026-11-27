import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { handedToWorker, mainContexts, watchCanvases, withoutOffscreenCanvas, withoutWebGL, withoutWorkerWebGL } from "./webgl";

/**
 * The rules every Signature site must keep, checked on the lab:
 * content first, motion only on top, nothing that shuts anyone out.
 */

const PAGES = ["/", "/scen/"];

async function settle(page: Page, ms = 2500) {
  await page.waitForLoadState("load");
  await page.waitForTimeout(ms);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("every page shows all its content and its links work", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Rörelse som betyder något." })).toBeVisible();
    // The headline moves without any script: its letters carry a CSS animation.
    expect(await page.locator(".hero-title .sg-c").first().evaluate((letter) => getComputedStyle(letter).animationName)).toBe("sg-rise");
    await expect(page.getByText("Varje rörelse på en Signature-sajt har ett skäl.", { exact: false })).toBeVisible();
    for (const step of ["Idén", "Rörelsen", "Hantverket"]) await expect(page.getByRole("heading", { level: 3, name: step })).toBeVisible();
    await page.getByRole("link", { name: /Scen två: sidövergången/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Sidan bytte, känslan höll." })).toBeVisible();
  });

  test("there is no intro curtain", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sg-intro")).toBeHidden();
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves, nothing is hidden, and the ink field is a still gradient", async ({ page }) => {
    const errors = collectErrors(page);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto("/?webgl");
    await settle(page);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-sg-motion", "off");
    await expect(html).toHaveAttribute("data-sg-smooth", "off");
    await expect(html).toHaveAttribute("data-sg-webgl", "off");
    // The headline is the whole sentence, to readers and to screen readers.
    const title = page.getByRole("heading", { level: 1, name: "Rörelse som betyder något." });
    await expect(title).toHaveText("Rörelse som betyder något.");
    // No animation of any kind is running.
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    // The scene is a plain list: every step fully visible.
    for (const step of await page.locator("[data-step]").all()) await expect(step).toHaveCSS("opacity", "1");
    expect(requests.some((url) => url.includes("ink-field"))).toBe(false);
    await expect(page.locator('[data-sg-status="motion"]')).toHaveText("Av, eftersom du har bett om mindre rörelse");
    await expect(page.locator(".sg-intro")).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe("with motion", () => {
  test("the headline arrives letter by letter, and screen readers get the whole sentence once", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    // The intro curtain plays first on a visit's first page, then the headline.
    await settle(page, 4500);
    const title = page.locator(".hero-title");
    await expect(title).toHaveAttribute("aria-label", "Rörelse som betyder något.");
    await expect(page.getByRole("heading", { level: 1, name: "Rörelse som betyder något." })).toBeVisible();
    // Settled: every letter back in place, at its normal width.
    const settled = await title.evaluate((element) =>
      [...element.querySelectorAll<HTMLElement>(".sg-c")].every((span) => {
        const style = getComputedStyle(span);
        return style.transform === "none" || style.transform === "matrix(1, 0, 0, 1, 0, 0)";
      }),
    );
    expect(settled).toBe(true);
    await expect(page.locator("html")).toHaveAttribute("data-sg-motion", "on");
    expect(errors).toEqual([]);
  });

  test("the scene follows the scroll: the counter and the active step change together", async ({ page, isMobile }) => {
    test.skip(isMobile, "The ring is pinned only on wide screens; phones get the plain list.");
    await page.goto("/");
    await settle(page);
    // The scene and the engine it needs are set up as it comes near the screen.
    const scene = page.locator('[data-sg="scene"]');
    await scene.scrollIntoViewIfNeeded();
    await expect(scene).toHaveClass(/is-scrubbed/);
    const steps = page.locator("[data-step]");
    await steps.nth(2).scrollIntoViewIfNeeded();
    await page.evaluate(() => document.querySelectorAll("[data-step]")[2].scrollIntoView({ block: "center" }));
    await page.waitForTimeout(1500);
    await expect(page.locator("[data-sg-count]")).toHaveText("03");
    await expect(steps.nth(2)).toHaveAttribute("data-active", "");
  });

  test("without WebGL the ink field stays the still gradient, and says why", async ({ page }) => {
    const errors = collectErrors(page);
    // A device without WebGL, on the main thread and in the worker: the same answer on a laptop's GPU and on a CI runner without one.
    await withoutWebGL(page);
    await watchCanvases(page);
    await page.goto("/?webgl");
    await expect(page.locator("html")).toHaveAttribute("data-sg-webgl", "off", { timeout: 10_000 });
    const field = page.locator('[data-sg="ink-field"]');
    await expect(field).toHaveAttribute("data-sg-state", "still");
    await expect(field).not.toHaveClass(/is-live/);
    await expect(page.locator('[data-sg-status="webgl"]')).toHaveText("Av: stillbild, enheten saknar snabb grafik");
    // It was the worker that found no WebGL: the canvas had been handed to it.
    expect(await field.locator("canvas").evaluate(handedToWorker)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("on a software renderer the ink field stays the still gradient, decided in the worker", async ({ page }) => {
    const errors = collectErrors(page);
    // Headless Chrome draws WebGL on the CPU (SwiftShader): without `?webgl` that is refused, as for a visitor.
    const renderer = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    });
    test.skip(!/swiftshader/i.test(renderer), "Needs a software renderer.");
    await watchCanvases(page);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-sg-webgl", "off", { timeout: 15_000 });
    const field = page.locator('[data-sg="ink-field"]');
    await expect(field).toHaveAttribute("data-sg-state", "still");
    expect(await field.locator("canvas").evaluate(handedToWorker)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("the ink field draws in a worker: the page itself never creates a WebGL context", async ({ page }) => {
    const errors = collectErrors(page);
    await watchCanvases(page);
    await page.goto("/?webgl");
    const field = page.locator('[data-sg="ink-field"]');
    await expect(field).toHaveClass(/is-live/, { timeout: 15_000 });
    await expect(field).toHaveAttribute("data-sg-state", "webgl");
    expect(await field.locator("canvas").evaluate(handedToWorker)).toBe(true);
    expect(await page.evaluate(mainContexts)).toBe(0);
    expect(errors).toEqual([]);
  });

  test("reduced motion switched on and off again: the field stops, then draws again in the same worker", async ({ page }) => {
    const errors = collectErrors(page);
    await watchCanvases(page);
    await page.goto("/?webgl");
    const field = page.locator('[data-sg="ink-field"]');
    await expect(field).toHaveClass(/is-live/, { timeout: 15_000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(field).not.toHaveClass(/is-live/);
    await expect(page.locator("html")).toHaveAttribute("data-sg-webgl", "off");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await expect(field).toHaveClass(/is-live/, { timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("data-sg-webgl", "on");
    // The canvas was handed over once and stays in its worker; nothing was drawn here.
    expect(await page.evaluate(mainContexts)).toBe(0);
    expect(errors).toEqual([]);
  });

  for (const [name, setUp] of [
    ["without OffscreenCanvas", withoutOffscreenCanvas],
    ["where a worker cannot draw WebGL", withoutWorkerWebGL],
  ] as const) {
    test(`${name}, the ink field draws on the main thread, as before`, async ({ page }) => {
      const errors = collectErrors(page);
      await setUp(page);
      await watchCanvases(page);
      await page.goto("/?webgl");
      const field = page.locator('[data-sg="ink-field"]');
      await expect(field).toHaveClass(/is-live/, { timeout: 15_000 });
      expect(await field.locator("canvas").evaluate(handedToWorker)).toBe(false);
      expect(await page.evaluate(mainContexts)).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });
  }

  test("with WebGL the ink field draws after the page has loaded", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/?webgl");
    const field = page.locator('[data-sg="ink-field"]');
    await expect(field).toHaveClass(/is-live/, { timeout: 15_000 });
    await expect(field).toHaveAttribute("data-sg-state", "webgl");
    await expect(page.locator('[data-sg-status="webgl"]')).toHaveText("På: bläcket ritas av grafikkortet");
    expect(errors).toEqual([]);
  });

  test("the intro plays once per visit, never blocks a click, and the headline waits for it", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveClass(/sg-intro-on/);
    const curtain = page.locator(".sg-intro");
    await expect(curtain).toHaveAttribute("aria-hidden", "true");
    await expect(curtain).toHaveCSS("pointer-events", "none");
    await expect(curtain).toHaveCSS("position", "fixed");
    const delay = await page.locator(".hero-title .sg-c").first().evaluate((letter) => Number.parseFloat(getComputedStyle(letter).animationDelay));
    expect(delay).toBeGreaterThanOrEqual(1.5);
    // Clicks go straight through the curtain while it is up.
    await page.getByRole("link", { name: "Bibliotek", exact: true }).click();
    await expect(page).toHaveURL(/\/bibliotek\/$/);
    // Back on the first page in the same visit: no curtain again.
    await page.goto("/");
    await expect(html).not.toHaveClass(/sg-intro-on/);
    await expect(curtain).toBeHidden();
  });

  test("the next page is an ordinary link, with the browser's own page transition", async ({ page }) => {
    await page.goto("/");
    await settle(page, 1200);
    const css = await page.evaluate(() =>
      [...document.styleSheets].some((sheet) => {
        try {
          return [...sheet.cssRules].some((rule) => rule.cssText.startsWith("@view-transition"));
        } catch {
          return false;
        }
      }),
    );
    expect(css).toBe(true);
    await page.getByRole("link", { name: /Scen två: sidövergången/ }).click();
    await expect(page).toHaveURL(/\/scen\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Sidan bytte, känslan höll." })).toBeVisible();
  });
});

for (const motion of ["no-preference", "reduce"] as const) {
  for (const path of PAGES) {
    test(`no accessibility errors on ${path} (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: motion });
      await page.goto(path);
      await settle(page, 3000);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    });
  }
}

test("no page scrolls sideways", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);
    await settle(page, 800);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
