import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/** The page for a missing address: it says so plainly and offers the way on. */

const PAGE = "/404.html";

test("the missing page says so, is kept out of search, and leads back", async ({ page }) => {
  await page.goto(PAGE);
  await expect(page.getByRole("heading", { level: 1, name: "Den här sidan finns inte." })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await page.getByRole("link", { name: "Till biblioteket" }).click();
  await expect(page).toHaveURL(/\/bibliotek\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Byggstenarna." })).toBeVisible();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the missing page still says so and leads back", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1, name: "Den här sidan finns inte." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Till labbet" })).toHaveAttribute("href", "./");
  });
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`no accessibility errors on the missing page (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(PAGE);
    await page.waitForTimeout(2500);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("the missing page does not scroll sideways", async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});
