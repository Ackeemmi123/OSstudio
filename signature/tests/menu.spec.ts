import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The full-screen menu (library and Hantverk) and the reveal list (library):
 * content first, a keyboard path that never leaves the menu, nothing moving
 * with reduced motion, no accessibility errors, no sideways scroll.
 */

const PAGES = ["/bibliotek/", "/hantverk/"] as const;
const LINKS = ["Labb 01", "Scen två", "Bibliotek", "En sida.", "Hantverk", "Lekfull"];
const ROWS = ["Natt", "Lila", "Skog", "Ockra", "Terrakotta", "Bandet"];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Skips the intro curtains, which have their own tests. */
async function open(page: Page, path: string) {
  await page.addInitScript(() => {
    sessionStorage.setItem("sg-intro", "1");
    sessionStorage.setItem("sg-intro-hantverk", "1");
  });
  await page.goto(path);
}

const focused = (page: Page) => page.evaluate(() => document.activeElement?.textContent?.replace(/\s+/g, " ").trim() ?? "");
const inert = (page: Page) => page.evaluate(() => ["main", ".mark", ".skip", "footer"].map((selector) => (document.querySelector(selector) as HTMLElement).inert));

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of PAGES) {
    test(`the menu is a plain list of links in the bar (${path})`, async ({ page }) => {
      await page.goto(path);
      const nav = page.getByRole("navigation", { name: "Labbet" });
      for (const name of LINKS) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
      await expect(nav.getByRole("button")).toHaveCount(0);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    });
  }

  test("every row of the reveal list reads, each with its own picture", async ({ page }) => {
    await page.goto("/bibliotek/");
    const list = page.locator(".materials-list");
    for (const name of ROWS) await expect(list.getByRole("heading", { level: 3, name })).toBeVisible();
    const thumbs = page.locator(".materials [data-sg-thumb]");
    await expect(thumbs).toHaveCount(6);
    for (const thumb of await thumbs.all()) {
      await thumb.scrollIntoViewIfNeeded();
      await expect(thumb).toBeVisible();
    }
  });
});

for (const path of PAGES) {
  test.describe(`the menu (${path})`, () => {
    test("opens from the keyboard, keeps focus inside, closes with Esc and gives focus back", async ({ page }) => {
      const errors = collectErrors(page);
      await open(page, path);
      const toggle = page.locator("[data-sg-menu-toggle]");
      await expect(page.locator('[data-sg="menu"]')).toHaveClass(/is-ready/);
      await expect(toggle).toHaveAccessibleName("Meny");
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await toggle.focus();
      await page.keyboard.press("Enter");

      const dialog = page.getByRole("dialog", { name: "Meny" });
      await expect(dialog).toBeVisible();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(toggle).toHaveAccessibleName("Stäng");
      // Focus moves to the first link, and the page behind can no longer be reached.
      expect(await focused(page)).toContain("Labb 01");
      expect(await inert(page)).toEqual([true, true, true, true]);
      await expect(page.locator("html")).toHaveCSS("overflow", "hidden");

      // Round and round: past the last link to the button, and back.
      for (let step = 1; step < LINKS.length; step++) await page.keyboard.press("Tab");
      expect(await focused(page)).toContain("Lekfull");
      await page.keyboard.press("Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Tab");
      expect(await focused(page)).toContain("Labb 01");
      await page.keyboard.press("Shift+Tab");
      await expect(toggle).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      expect(await focused(page)).toContain("Lekfull");

      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute("aria-expanded", "false");
      await expect(toggle).toHaveAccessibleName("Meny");
      expect(await inert(page)).toEqual([false, false, false, false]);
      expect(errors).toEqual([]);
    });

    test("the button closes it too, and the links arrive one after the other", async ({ page }) => {
      await open(page, path);
      const toggle = page.getByRole("button", { name: "Meny" });
      await toggle.click();
      const lines = page.locator("[data-sg-menu-panel] li > a > *");
      // Mid-way, an early link has risen further than a late one.
      await page.waitForTimeout(450);
      // How far below its place a line still is, in per cent of its height ("none" once it has arrived).
      const below = (element: Element) => Number.parseFloat(getComputedStyle(element).translate.split(" ")[1] ?? "0") || 0;
      const [first, last] = await Promise.all([lines.first().evaluate(below), lines.last().evaluate(below)]);
      expect(last).toBeGreaterThan(first);
      await expect.poll(() => lines.last().evaluate((element) => getComputedStyle(element).translate)).toBe("none");
      await page.getByRole("button", { name: "Stäng" }).click();
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(page.locator("[data-sg-menu-toggle]")).toBeFocused();
    });

    test("with reduced motion it opens and closes at once, with nothing moving", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await open(page, path);
      await expect(page.locator('[data-sg="menu"]')).toHaveClass(/is-ready/);
      await page.getByRole("button", { name: "Meny" }).click();
      await expect(page.getByRole("dialog", { name: "Meny" })).toBeVisible();
      const running = () => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length);
      expect(await running()).toBe(0);
      expect(await page.locator("[data-sg-menu-panel]").evaluate((element) => getComputedStyle(element).clipPath)).toMatch(/inset\(0(px)?\)/);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      expect(await running()).toBe(0);
    });

    for (const motion of ["no-preference", "reduce"] as const) {
      test(`no accessibility errors with the menu open (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: motion });
        await open(page, path);
        await expect(page.locator('[data-sg="menu"]')).toHaveClass(/is-ready/);
        await page.getByRole("button", { name: "Meny" }).click();
        await page.waitForTimeout(2200);
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }

    test("the button steps out of the way reading down, comes back on any move up, and stays near the top, with focus and with reduced motion", async ({ page }) => {
      await open(page, path);
      await expect(page.locator('[data-sg="menu"]')).toHaveClass(/is-ready/);
      const toggle = page.locator("[data-sg-menu-toggle]");
      const shown = () => toggle.evaluate((element) => element.getBoundingClientRect().bottom > 0);
      const scroll = async (by: number) => {
        for (let step = 0; step < 4; step++) await page.evaluate((y) => window.scrollBy(0, y), by / 4);
      };
      await scroll(40);
      await page.waitForTimeout(700);
      expect(await shown()).toBe(true);
      await scroll(600);
      await expect.poll(shown).toBe(false);
      // A trackpad's few pixels back do nothing; a real move up brings it back.
      await page.evaluate(() => window.scrollBy(0, -3));
      await page.waitForTimeout(700);
      expect(await shown()).toBe(false);
      await scroll(-40);
      await expect.poll(shown).toBe(true);
      // With focus it stays.
      await toggle.focus();
      await scroll(500);
      await page.waitForTimeout(700);
      expect(await shown()).toBe(true);
      await toggle.blur();
      // Back near the top it is always there.
      await scroll(400);
      await expect.poll(shown).toBe(false);
      await page.evaluate(() => window.scrollTo(0, 30));
      await expect.poll(shown).toBe(true);
      // With reduced motion it never moves.
      await page.emulateMedia({ reducedMotion: "reduce" });
      await scroll(800);
      await page.waitForTimeout(700);
      expect(await shown()).toBe(true);
    });

    test("on a wide screen the open menu shows each page's picture beside the list, fetched only once it opens", async ({ page, isMobile }) => {
      const pictures = /bandet-delar-800|siden-natt-800/;
      const fetched: string[] = [];
      page.on("request", (request) => pictures.test(request.url()) && fetched.push(request.url()));
      await open(page, path);
      await expect(page.locator('[data-sg="menu"]')).toHaveClass(/is-ready/);
      await page.waitForTimeout(800);
      expect(fetched).toEqual([]);
      await page.getByRole("button", { name: "Meny" }).click();
      const column = page.locator("[data-sg-menu-pictures]");
      if (isMobile) {
        // On a phone the list fills the screen: no pictures, nothing fetched.
        await page.waitForTimeout(1200);
        await expect(column).toBeHidden();
        expect(fetched).toEqual([]);
        return;
      }
      await expect(column).toBeVisible();
      await expect.poll(() => fetched.length).toBeGreaterThanOrEqual(2);
      const box = (await column.boundingBox())!;
      expect(box.x).toBeGreaterThan(page.viewportSize()!.width / 2);
      // Focus starts on the first link, so its page's mark shows; hover and keyboard both lead the picture.
      await expect(column.locator(".is-active")).toHaveClass(/menu-mark-lab/);
      await page.locator("[data-sg-menu-panel] li > a").nth(3).hover();
      await expect(column.locator(".is-active")).toHaveAttribute("src", /siden-natt/);
      await page.keyboard.press("Tab");
      await expect(column.locator(".is-active")).toHaveClass(/menu-mark-scen/);
      await expect(column).toHaveAttribute("aria-hidden", "true");
    });

    test("does not scroll sideways, open or closed", async ({ page }) => {
      await open(page, path);
      const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.waitForTimeout(600);
      expect(await overflow()).toBeLessThanOrEqual(0);
      await page.getByRole("button", { name: "Meny" }).click();
      await page.waitForTimeout(1800);
      expect(await overflow()).toBeLessThanOrEqual(0);
      const panel = await page.locator("[data-sg-menu-panel]").evaluate((element) => element.scrollWidth - element.clientWidth);
      expect(panel).toBeLessThanOrEqual(0);
    });
  });
}

test("without JavaScript the bar's list of links does not scroll sideways", async ({ browser }) => {
  for (const path of PAGES) {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 740 } });
    const page = await context.newPage();
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await context.close();
  }
});

test.describe("the reveal list", () => {
  test("with a mouse, the row's picture follows the pointer, leans with speed and leaves with it", async ({ page, isMobile }) => {
    test.skip(isMobile, "Touch screens get the pictures in the rows.");
    const errors = collectErrors(page);
    await open(page, "/bibliotek/");
    await page.evaluate(() => document.querySelector(".materials-list")!.scrollIntoView({ block: "start" }));
    const section = page.locator(".materials");
    await expect(section).toHaveClass(/is-live/);
    await expect(page.locator(".materials [data-sg-thumb]").first()).toBeHidden();
    const float = page.locator(".sg-reveal-float");
    await expect(float).toHaveAttribute("aria-hidden", "true");

    const row = (index: number) => page.locator(".materials-row").nth(index).boundingBox().then((box) => box!);
    let box = await row(1);
    await page.mouse.move(400, box.y + box.height / 2);
    await expect(float).toBeVisible();
    await expect(float.locator("img.is-active")).toHaveAttribute("src", /siden-lila/);
    // It follows with weight: after a quick move it lags behind and leans; at rest it catches up and straightens.
    box = await row(2);
    await page.mouse.move(1000, box.y + box.height / 2, { steps: 2 });
    await page.waitForTimeout(80);
    const moving = await float.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.left + box.width / 2, angle: new DOMMatrix(getComputedStyle(element).transform).b };
    });
    expect(moving.x).toBeLessThan(990);
    expect(Math.abs(moving.angle)).toBeGreaterThan(0.02);
    await expect(float.locator("img.is-active")).toHaveAttribute("src", /siden-skog/);
    await expect.poll(() => float.evaluate((element) => Math.abs(new DOMMatrix(getComputedStyle(element).transform).b)), { timeout: 4000 }).toBeLessThan(0.005);
    const rest = await float.boundingBox();
    expect(Math.abs(rest!.x + rest!.width / 2 - 1000)).toBeLessThan(6);
    // Off the rows, it goes.
    box = await row(5);
    await page.mouse.move(400, box.y + box.height + 30);
    await expect(float).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("on a phone, or with reduced motion, each row shows its picture and nothing follows", async ({ page, isMobile }) => {
    if (!isMobile) await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/bibliotek/");
    const list = page.locator(".materials-list");
    await list.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    for (const thumb of await page.locator(".materials [data-sg-thumb]").all()) {
      await thumb.scrollIntoViewIfNeeded();
      await expect(thumb).toBeVisible();
    }
    await expect(page.locator(".materials")).not.toHaveClass(/is-live/);
    await expect(page.locator(".sg-reveal-float")).toHaveCount(0);
    const box = (await page.locator(".materials-row").nth(2).boundingBox())!;
    await page.mouse.move(box.x + 200, box.y + box.height / 2);
    await page.waitForTimeout(300);
    if (!isMobile) expect(await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length)).toBe(0);
  });

  test("the library with the list does not scroll sideways", async ({ page }) => {
    await open(page, "/bibliotek/");
    for (const row of await page.locator(".materials-row").all()) await row.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  });
});
