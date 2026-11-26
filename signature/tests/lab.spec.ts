import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

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
    expect(errors).toEqual([]);
  });
});

test.describe("with motion", () => {
  test("the headline arrives letter by letter, and screen readers get the whole sentence once", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/");
    await settle(page, 3000);
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
    // A device without WebGL: the same answer on a laptop's GPU and on a CI runner without one.
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        return /webgl/i.test(type) ? null : (original as (...args: unknown[]) => RenderingContext | null).call(this, type, ...rest);
      } as typeof original;
    });
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("data-sg-webgl", "off", { timeout: 10_000 });
    const field = page.locator('[data-sg="ink-field"]');
    await expect(field).toHaveAttribute("data-sg-state", "still");
    await expect(field).not.toHaveClass(/is-live/);
    await expect(page.locator('[data-sg-status="webgl"]')).toHaveText("Av: stillbild, enheten saknar snabb grafik");
    expect(errors).toEqual([]);
  });

  test("with WebGL the ink field draws after the page has loaded", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto("/?webgl");
    const field = page.locator('[data-sg="ink-field"]');
    await expect(field).toHaveClass(/is-live/, { timeout: 15_000 });
    await expect(field).toHaveAttribute("data-sg-state", "webgl");
    await expect(page.locator('[data-sg-status="webgl"]')).toHaveText("På: bläcket ritas av grafikkortet");
    expect(errors).toEqual([]);
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
