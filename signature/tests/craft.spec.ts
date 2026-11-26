import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** The second showcase: the same engine, light and warm, with its own curtain. */

const PAGE = "/hantverk/";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function scrollThrough(page: Page) {
  for (const selector of [".craft-statement", ".craft-ticker", ".craft-story", ".craft-pair", ".craft-next", ".craft-foot"]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
  }
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("everything reads, the pictures are there, and there is no curtain", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1, name: "Långsamt gjort, snabbt laddat." })).toBeVisible();
    await expect(page.locator(".sg-intro")).toBeHidden();
    for (const title of ["Brief och idé", "Innehåll", "Hantverk", "Lansering"]) await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();
    await expect(page.getByRole("img", { name: "Champagnefärgat siden i långa, mjuka veck" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Visning ett: En sida\./ })).toHaveAttribute("href", "../visning/");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("no curtain and nothing moves", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(PAGE);
    await page.waitForLoadState("load");
    await expect(page.locator("html")).not.toHaveClass(/sg-intro-on/);
    await scrollThrough(page);
    await expect(page.locator(".sg-marquee-copy")).toHaveCount(0);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test("its own curtain plays once per visit, separately from the lab's", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("sg-intro", "1"));
  await page.goto(PAGE);
  await expect(page.locator("html")).toHaveClass(/sg-intro-on/);
  await expect(page.locator(".sg-intro")).toHaveCSS("pointer-events", "none");
  await page.goto(PAGE);
  await expect(page.locator("html")).not.toHaveClass(/sg-intro-on/);
});

test("the picture in the dark showcase's link flies into this page's hero, which then needs no second entrance", async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("sg-intro", "1");
    sessionStorage.setItem("sg-intro-hantverk", "1");
  });
  await page.goto("/visning/");
  const link = page.locator(".show-next .next-link");
  await link.scrollIntoViewIfNeeded();
  await expect(link.locator(".next-picture")).toHaveCSS("view-transition-name", "craft-picture");
  await link.click();
  await expect(page).toHaveURL(/\/hantverk\/$/);
  const frame = page.locator(".craft-hero-figure [data-sg=reveal]");
  await expect(frame).toHaveCSS("view-transition-name", "craft-picture");
  // Reached through the browser's own view transition: the picture is already in place.
  await expect(page.locator("html")).toHaveAttribute("data-sg-arrived", "transition");
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`no accessibility errors on the warm showcase (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(PAGE);
    await page.waitForTimeout(3000);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("the warm showcase does not scroll sideways", async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForTimeout(800);
  await scrollThrough(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
