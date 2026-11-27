import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** The third showcase: the same engine, bold and playful, with shapes that can be picked up. */

const PAGE = "/lekfull/";

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function scrollThrough(page: Page) {
  for (const selector of [".play-say", ".play-ticker", ".play-steps", ".card-blue", ".play-kit", ".play-light", ".play-next", ".play-foot"]) {
    await page.locator(selector).scrollIntoViewIfNeeded();
    await page.waitForTimeout(450);
  }
}

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("everything reads, the shapes are drawn, and nothing asks to be dragged", async ({ page }) => {
    await page.goto(PAGE);
    await expect(page.getByRole("heading", { level: 1, name: "Lek på allvar." })).toBeVisible();
    for (const title of ["Brief och idé", "Innehåll", "Form och färg", "Lansering"]) await expect(page.getByRole("heading", { level: 3, name: title })).toBeVisible();
    for (const name of ["Solen", "Bågen", "Vågen", "Blomman", "Stjärnan", "Kapseln"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.locator(".play-stage .toy-sun svg")).toBeVisible();
    await expect(page.locator(".play-hint")).toBeHidden();
    await expect(page.getByRole("link", { name: /Visning ett: En sida\./ })).toHaveAttribute("href", "../visning/");
    await expect(page.getByRole("link", { name: /Visning två: Hantverk/ })).toHaveAttribute("href", "../hantverk/");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("nothing moves and the shapes stay where they were drawn", async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto(PAGE);
    await page.waitForLoadState("load");
    await scrollThrough(page);
    await expect(page.locator(".sg-marquee-copy")).toHaveCount(0);
    await expect(page.locator(".play-stage")).not.toHaveClass(/is-live/);
    await expect(page.locator(".play-hint")).toBeHidden();
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[data-sg-toy]")].filter((toy) => toy.style.transform).length)).toBe(0);
    expect(errors).toEqual([]);
  });
});

test("a shape can be dragged away and swings back to its place", async ({ page, isMobile }) => {
  test.skip(isMobile, "dragged with a mouse here; touch uses the same pointer events");
  const errors = collectErrors(page);
  await page.goto(PAGE);
  const stage = page.locator(".play-stage");
  await expect(stage).toHaveClass(/is-live/);
  await expect(page.locator(".play-hint")).toBeVisible();
  const toy = page.locator(".toy-sun");
  await page.waitForTimeout(1500);
  const home = (await toy.boundingBox())!;
  await page.mouse.move(home.x + home.width / 2, home.y + home.height / 2);
  await page.mouse.down();
  await page.mouse.move(home.x + home.width / 2 - 220, home.y + home.height / 2 + 120, { steps: 8 });
  await page.waitForTimeout(100);
  const away = (await toy.boundingBox())!;
  expect(home.x - away.x).toBeGreaterThan(150);
  await page.mouse.up();
  await page.mouse.move(5, 5);
  // On its spring, it comes home and the script lets go of it.
  await expect.poll(async () => toy.evaluate((element: HTMLElement) => element.style.transform), { timeout: 8000 }).toBe("");
  expect(errors).toEqual([]);
});

test("both other showcases link here", async ({ page }) => {
  for (const from of ["/visning/", "/hantverk/"]) {
    await page.goto(from);
    await expect(page.getByRole("link", { name: /Visning tre: Lekfull/ })).toHaveAttribute("href", "../lekfull/");
  }
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`no accessibility errors on the playful showcase (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto(PAGE);
    await page.waitForTimeout(3000);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("the playful showcase does not scroll sideways", async ({ page }) => {
  await page.goto(PAGE);
  await page.waitForTimeout(800);
  await scrollThrough(page);
  // On failure, name what sticks out past the right edge, so a run elsewhere (CI's Linux) says where to look.
  const { overflow, past } = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const past = [...document.querySelectorAll("body *")]
      .map((element) => ({ element, right: element.getBoundingClientRect().right }))
      .filter(({ right }) => right > width + 0.5)
      .sort((a, b) => b.right - a.right)
      .slice(0, 6)
      .map(({ element, right }) => `${element.tagName.toLowerCase()}.${[...element.classList].join(".")} right ${right.toFixed(1)} of ${width}: "${element.textContent?.trim().slice(0, 30)}"`);
    return { overflow: document.documentElement.scrollWidth - width, past };
  });
  expect(overflow, past.join("\n")).toBeLessThanOrEqual(0);
});
