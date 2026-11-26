import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** The showcase: one idea built from the library, held to the same rules. */

const PAGE = "/visning/";
const FIGURES = ["100", "2,8", "0,8", "0"];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function scrollThrough(page: Page) {
  for (const selector of [".show-statement", ".show-object", ".show-gallery", ".show-numbers", ".show-foot"]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
  }
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the whole idea reads: the headline, the statement, the band, the pictures and the measured figures", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1, name: "En sida." })).toBeVisible();
    await expect(page.getByText("Vi bygger inte en samling sidor.", { exact: false })).toBeVisible();
    await expect(page.getByRole("img", { name: "Ett band av borstad metall i en Möbiusslinga mot en mörkblå bakgrund, renderat i 3D" })).toBeVisible();
    await expect(page.locator(".gallery-slide")).toHaveCount(4);
    const figures = page.locator(".show-figures [data-sg-digits]");
    await expect(figures).toHaveText(FIGURES);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves, and every figure shows its value at once", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(PAGE);
    await page.waitForLoadState("load");
    await scrollThrough(page);
    await expect(page.locator(".show-figures [data-sg-digits]")).toHaveText(FIGURES);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test("with motion, the figures count up to their values, and screen readers get each value once", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto(PAGE);
  await scrollThrough(page);
  await page.locator(".show-numbers").scrollIntoViewIfNeeded();
  await expect(page.locator(".show-figures [data-sg-digits]")).toHaveText(FIGURES, { timeout: 6000 });
  for (const digits of await page.locator(".show-figures [data-sg-digits]").all()) await expect(digits).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".show-figures .sg-sr")).toHaveText(FIGURES);
  expect(errors).toEqual([]);
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`no accessibility errors on the showcase (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(PAGE);
    await page.waitForTimeout(2500);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("the showcase does not scroll sideways", async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForTimeout(800);
  await scrollThrough(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
