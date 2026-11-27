import { expect, test, type Page } from "@playwright/test";

/**
 * Leaving a page through the open menu, and coming back. Playwright starts
 * Chrome with its back-forward cache off; a visitor's browser has it on, and
 * that is the case the menu must handle (the page comes back as it was left,
 * with the menu open, and closes it as it is shown).
 */
test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"], ignoreDefaultArgs: ["--disable-back-forward-cache"] } });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function open(page: Page, path: string) {
  await page.addInitScript(() => {
    sessionStorage.setItem("sg-intro", "1");
    sessionStorage.setItem("sg-intro-hantverk", "1");
  });
  await page.goto(path);
}

const inert = (page: Page) => page.evaluate(() => ["main", ".mark", ".skip", "footer"].map((selector) => (document.querySelector(selector) as HTMLElement).inert));

test("leaving through the open menu: the next page arrives cleanly, and Back shows the page with its menu closed", async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    // Whether the menu was open as the page was left, and whether it came back from the back-forward cache.
    addEventListener("pagehide", () => document.documentElement.setAttribute("data-test-left-open", String(document.documentElement.classList.contains("sg-menu-open"))));
    addEventListener("pageshow", (event) => document.documentElement.setAttribute("data-test-restored", String(event.persisted)));
  });
  await open(page, "/hantverk/");
  await expect(page.locator('[data-sg="menu"]')).toHaveClass(/is-ready/);
  await page.getByRole("button", { name: "Meny" }).click();
  const dialog = page.getByRole("dialog", { name: "Meny" });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(1200);
  await dialog.getByRole("link", { name: /^En sida\./ }).click();

  await expect(page).toHaveURL(/\/visning\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "En sida." })).toBeVisible();
  // The next page rose over the open menu as a view transition.
  await expect(page.locator("html")).toHaveAttribute("data-sg-arrived", "transition");
  await page.waitForTimeout(1200);

  // A page restored from memory fires no load event: wait for the navigation itself.
  await page.goBack({ waitUntil: "commit" });
  await expect(page).toHaveURL(/\/hantverk\/$/);
  // Kept in memory with the menu open, and closed again as it is shown.
  await expect(page.locator("html")).toHaveAttribute("data-test-restored", "true");
  await expect(page.locator("html")).toHaveAttribute("data-test-left-open", "true");
  const toggle = page.locator("[data-sg-menu-toggle]");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(toggle).toHaveAccessibleName("Meny");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator("html")).not.toHaveClass(/sg-menu-open/);
  expect(await inert(page)).toEqual([false, false, false, false]);
  expect(errors).toEqual([]);
});
