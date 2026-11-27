import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The stack (cards that stack as you scroll, CSS alone) and the call to
 * action (the page's own link, floating as a pill once past the first
 * screen), both on the library. Content first: a plain list and a plain link
 * without JavaScript; no scale, shade, glide or slide with reduced motion; keyboard
 * focus never hidden under a later card or under the pill; no accessibility
 * errors; no sideways scroll; no console errors. Motion is judged on frames
 * recorded in the page, never on one sample after a fixed wait.
 */

const STEPS = ["Brief och idé", "Innehåll", "Hantverk", "Lansering"];

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/** Skips the intro curtain, which has its own tests, and waits for the call to action to take over. */
async function open(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem("sg-intro", "1"));
  await page.goto("/bibliotek/");
  await expect(page.locator('[data-sg="cta"]')).toHaveClass(/is-ready/, { timeout: 10_000 });
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

/** Scrolls down in small steps until the whole stack has passed the middle of the screen, wherever modules above have moved it. */
async function scrollPastStack(page: Page, step: number) {
  for (let i = 0; i < 600; i++) {
    const done = await page.evaluate((by) => {
      if (document.querySelector(".stack")!.getBoundingClientRect().bottom < innerHeight * 0.5) return true;
      window.scrollBy(0, by);
      return false;
    }, step);
    if (done) return;
    await page.waitForTimeout(16);
  }
  throw new Error("The stack never passed the middle of the screen.");
}

const stackTop = (page: Page) => page.evaluate(() => document.querySelector(".stack")!.getBoundingClientRect().top + scrollY);
const viewport = (page: Page) => page.evaluate(() => innerHeight);

type Frame = { top: number[]; at: number[]; scale: number[]; shade: number[] };

/** Records, on every frame the page draws, where each card is, where it sticks, and how far it has settled back and into shade. */
async function recordStack(page: Page) {
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll<HTMLElement>(".stack-card")];
    const record = { frames: [] as Frame[], stop: false };
    (window as unknown as { sgStack: typeof record }).sgStack = record;
    const sample = () => {
      record.frames.push({
        top: cards.map((card) => card.getBoundingClientRect().top),
        at: cards.map((card) => Number.parseFloat(getComputedStyle(card).top) || 0),
        scale: cards.map((card) => Number.parseFloat(getComputedStyle(card).scale) || 1),
        // The shade over each card (0 where there is none: reduced motion, a focused card).
        shade: cards.map((card) => {
          const after = getComputedStyle(card, "::after");
          return after.content === "none" ? 0 : Number(after.opacity);
        }),
      });
      if (!record.stop) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  return async () =>
    page.evaluate(() => {
      const record = (window as unknown as { sgStack: { frames: Frame[]; stop: boolean } }).sgStack;
      record.stop = true;
      return record.frames;
    });
}

/** Records the pill's top edge and the visible pill's left edge on every frame, with whether it floats and shows. */
async function recordPill(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-sg="cta"]')!;
    const link = root.querySelector("a")!;
    const record = { frames: [] as Array<{ top: number; left: number; shown: boolean; floating: boolean; opacity: number }>, stop: false };
    (window as unknown as { sgPill: typeof record }).sgPill = record;
    const sample = () => {
      record.frames.push({
        top: link.getBoundingClientRect().top,
        // What the eye follows: the stand-in while it glides, otherwise the link.
        left: (root.querySelector("span[aria-hidden] > a") ?? link).getBoundingClientRect().left,
        shown: root.classList.contains("is-shown"),
        floating: root.classList.contains("is-floating"),
        opacity: Number(getComputedStyle(link).opacity),
      });
      if (!record.stop) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  return async () =>
    page.evaluate(() => {
      const record = (window as unknown as { sgPill: { frames: Array<{ top: number; left: number; shown: boolean; floating: boolean; opacity: number }>; stop: boolean } }).sgPill;
      record.stop = true;
      return record.frames;
    });
}

/** "ok" when the focused element is on screen and its middle is not covered by anything else (a later card, the pill). */
const unobscured = (page: Page) =>
  page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null;
    if (!focused || focused === document.body) return "nothing focused";
    const box = focused.getBoundingClientRect();
    if (box.bottom <= 0 || box.top >= innerHeight) return `${focused.textContent?.trim()}: off screen`;
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit && focused.contains(hit) ? "ok" : `${focused.textContent?.trim()}: covered by ${hit?.closest("li, a, section")?.textContent?.trim().slice(0, 30)}`;
  });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("the stack is a plain list and the call to action the link where it stands", async ({ page }) => {
    await page.goto("/bibliotek/");
    const list = page.locator('[data-sg="stack"]');
    await expect(list.getByRole("listitem")).toHaveCount(4);
    expect(await list.getByRole("heading", { level: 3 }).allTextContents()).toEqual(STEPS);
    for (const card of await page.locator(".stack-card").all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card).toBeVisible();
      expect(await card.evaluate((element) => getComputedStyle(element).position)).toBe("static");
    }
    const link = page.locator('[data-sg="cta"] a');
    await link.scrollIntoViewIfNeeded();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "../hantverk/");
    await expect(link).toHaveAccessibleName("Se hantverket");
    expect(await link.evaluate((element) => getComputedStyle(element).position)).toBe("static");
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});

test.describe("the stack", () => {
  test("each card sticks in turn, the next slides over it, and the ones beneath settle back", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    const top = await stackTop(page);
    const height = await viewport(page);
    await scrollTo(page, top - height, 400);
    const stop = await recordStack(page);
    await scrollPastStack(page, 20);
    await page.waitForTimeout(100);
    const frames = await stop();
    expect(frames.length).toBeGreaterThan(20);

    // The next card slides up over a stuck one: the first holds its place while the second overlaps it.
    expect(frames.some((f) => Math.abs(f.top[0] - f.at[0]) < 2 && f.top[1] > f.at[1] + 40 && f.top[1] < f.top[0] + 300)).toBe(true);
    // The frame where the last card has just arrived: all four stacked, each a peek below the last, deeper ones smaller and darker.
    const last = frames.findIndex((f) => f.top[3] <= f.at[3] + 1);
    expect(last).toBeGreaterThan(0);
    const full = frames[last];
    // From then on the deck leaves as one: every card a peek below the last, never folding together.
    for (const frame of frames.slice(last)) {
      for (let i = 0; i < 3; i++) {
        expect(frame.top[i + 1] - frame.top[i]).toBeGreaterThan(8);
        expect(Math.abs(frame.top[i + 1] - frame.top[i] - (frame.at[i + 1] - frame.at[i]))).toBeLessThan(2);
      }
    }
    expect(full.scale[0]).toBeLessThan(0.9);
    expect(full.scale[0]).toBeLessThan(full.scale[1]);
    expect(full.scale[1]).toBeLessThan(full.scale[2]);
    expect(full.scale[2]).toBeLessThan(full.scale[3] - 0.02);
    // The cards beneath settle into the site's shade, deeper the further down; the top card has none.
    expect(full.shade[0]).toBeGreaterThan(0.4);
    expect(full.shade[0]).toBeGreaterThan(full.shade[1]);
    expect(full.shade[1]).toBeGreaterThan(full.shade[2]);
    expect(full.shade[3]).toBeCloseTo(0, 2);
    // Settling only ever goes one way while reading down.
    for (let i = 1; i < frames.length; i++) expect(frames[i].scale[0]).toBeLessThanOrEqual(frames[i - 1].scale[0] + 0.002);
    // And it was gradual, not a jump: many frames in between.
    expect(frames.filter((f) => f.scale[0] < 0.995 && f.scale[0] > 0.89).length).toBeGreaterThan(10);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("inside each card, as it rises to where it sticks, the picture settles from near and the number rises into place", async ({ page }) => {
    await open(page);
    const top = await stackTop(page);
    const height = await viewport(page);
    await scrollTo(page, top - height, 400);
    await page.evaluate(() => {
      const card = document.querySelectorAll<HTMLElement>(".stack-card")[1];
      const picture = card.querySelector<HTMLElement>("[data-sg-stack-zoom]")!;
      const mark = card.querySelector<HTMLElement>("[data-sg-stack-rise]")!;
      const record = { frames: [] as Array<{ top: number; at: number; zoom: number; rise: number }>, stop: false };
      (window as unknown as { sgCard: typeof record }).sgCard = record;
      const sample = () => {
        record.frames.push({
          top: card.getBoundingClientRect().top,
          at: Number.parseFloat(getComputedStyle(card).top),
          zoom: Number.parseFloat(getComputedStyle(picture).scale) || 1,
          rise: ((translate) => (translate === "none" ? 0 : Number.parseFloat(translate.split(" ")[1] ?? "0")))(getComputedStyle(mark).translate),
        });
        if (!record.stop) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await scrollPastStack(page, 20);
    const frames = await page.evaluate(() => {
      const record = (window as unknown as { sgCard: { frames: Array<{ top: number; at: number; zoom: number; rise: number }>; stop: boolean } }).sgCard;
      record.stop = true;
      return record.frames;
    });
    // While the card comes up from below the screen to where it sticks.
    const rising = frames.filter((f) => f.top < height && f.top > f.at + 2);
    expect(rising.length).toBeGreaterThan(10);
    expect(rising[0].zoom).toBeGreaterThan(1.1);
    expect(rising[0].rise).toBeGreaterThan(20);
    // Gradual and one way: many frames in between, never going back while reading down.
    expect(rising.filter((f) => f.zoom > 1.01 && f.zoom < 1.12).length).toBeGreaterThan(5);
    for (let i = 1; i < rising.length; i++) {
      expect(rising[i].zoom).toBeLessThanOrEqual(rising[i - 1].zoom + 0.002);
      expect(rising[i].rise).toBeLessThanOrEqual(rising[i - 1].rise + 0.5);
    }
    // Stuck, both are at rest.
    const stuck = frames.filter((f) => Math.abs(f.top - f.at) < 1);
    expect(stuck.length).toBeGreaterThan(0);
    for (const f of stuck) {
      expect(f.zoom).toBeCloseTo(1, 2);
      expect(Math.abs(f.rise)).toBeLessThan(0.5);
    }
  });

  test("with reduced motion the cards stack without scaling, shading or moving inside, and nothing animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const top = await stackTop(page);
    const height = await viewport(page);
    await scrollTo(page, top - height, 400);
    const stop = await recordStack(page);
    await scrollPastStack(page, 40);
    const frames = await stop();
    expect(frames.length).toBeGreaterThan(10);
    expect(frames.every((f) => f.scale.every((s) => s === 1) && f.shade.every((d) => d === 0))).toBe(true);
    // Plain sticky stacking still: the first card held its place while the next slid over it.
    expect(frames.some((f) => Math.abs(f.top[0] - f.at[0]) < 2 && f.top[1] > f.at[1] + 40 && f.top[1] < f.top[0] + 300)).toBe(true);
    const running = await page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === "running").length);
    expect(running).toBe(0);
  });
});

test.describe("the call to action", () => {
  test("shows past the first screen, steps aside reading down, comes back reading up, gives way to the footer and docks at its place", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    const root = page.locator('[data-sg="cta"]');
    const height = await viewport(page);
    const linkTop = () => root.locator("a").evaluate((element) => element.getBoundingClientRect().top);
    const onScreen = async () => {
      const top = await linkTop();
      return top > 0 && top + 40 < height;
    };
    // On the first screen: the link stays at its place further down, and nothing floats in view.
    await scrollTo(page, height * 0.5);
    await page.waitForTimeout(300);
    await expect(root).not.toHaveClass(/is-shown/);

    const stop = await recordPill(page);
    // Past the first screen, reading down: still out of the way.
    await scrollTo(page, height * 1.8);
    await expect(root).toHaveClass(/is-floating/);
    await expect(root).not.toHaveClass(/is-shown/);
    expect(await linkTop()).toBeGreaterThanOrEqual(height);
    // A move up brings it in; at rest it sits whole at the bottom centre.
    await scrollTo(page, height * 1.8 - 80, 20);
    await expect(root).toHaveClass(/is-shown/);
    await expect.poll(onScreen, { timeout: 4000 }).toBe(true);
    await expect.poll(async () => (await linkTop()) === (await page.waitForTimeout(120).then(linkTop)), { timeout: 4000 }).toBe(true);
    const box = (await root.locator("a").boundingBox())!;
    const width = page.viewportSize()!.width;
    expect(Math.abs(box.x + box.width / 2 - width / 2)).toBeLessThan(2);
    expect(box.y + box.height).toBeLessThan(height);
    expect(box.y + box.height).toBeGreaterThan(height - 48);
    // Reading down again, it slides away.
    await scrollTo(page, height * 1.8 + 200, 20);
    await expect(root).not.toHaveClass(/is-shown/);
    await expect.poll(linkTop, { timeout: 4000 }).toBeGreaterThanOrEqual(height);
    const frames = await stop();
    // It slid: frames between its place and below the screen, both ways.
    const between = frames.filter((f) => f.floating && f.top > box.y + 4 && f.top < height - 4);
    expect(between.length).toBeGreaterThan(1);

    // At its own place it is the link in the page again, once, coming back up to it from the footer (on the library
    // the image sequence, 13, lies between them).
    const bottom = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    await scrollTo(page, bottom, 400);
    const place = await page.evaluate(() => document.querySelector('[data-sg="cta"]')!.getBoundingClientRect().top + scrollY);
    await scrollTo(page, place - height * 0.5, 400);
    await scrollTo(page, place - height * 0.5 - 60, 10);
    await page.waitForTimeout(400);
    await expect(root).not.toHaveClass(/is-floating/);
    await expect(page.getByRole("link", { name: "Se hantverket" })).toHaveCount(1);

    // A footer far from the link's place: the pill gives way while it is in view, even reading up, and comes back after.
    await page.evaluate(() => document.querySelector(".film")!.after(document.querySelector("footer")!));
    const footer = await page.evaluate(() => document.querySelector("footer")!.getBoundingClientRect().top + scrollY);
    await scrollTo(page, footer - height * 1.5, 400);
    await scrollTo(page, footer - height * 0.5, 40);
    await scrollTo(page, footer - height * 0.5 - 80, 10);
    await page.waitForTimeout(400);
    await expect(root).toHaveClass(/is-floating/);
    await expect(root).not.toHaveClass(/is-shown/);
    expect(await linkTop()).toBeGreaterThanOrEqual(height);
    await scrollTo(page, footer - height * 1.5, 40);
    await expect(root).toHaveClass(/is-shown/);
    await page.reload();
    await expect(root).toHaveClass(/is-ready/, { timeout: 10_000 });
    await root.evaluate((element) => element.scrollIntoView({ block: "center" }));
    await expect(root).not.toHaveClass(/is-floating/);
    expect(await root.locator("a").evaluate((element) => getComputedStyle(element).position)).toBe("static");
    await expect(page.getByRole("link", { name: "Se hantverket" })).toHaveCount(1);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test("nearing its place it comes out to meet it, even reading down, and glides into it; reading back up it glides out", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    const root = page.locator('[data-sg="cta"]');
    const height = await viewport(page);
    const width = page.viewportSize()!.width;
    // Modules higher up take their full height only once scrolled past (pins), so find the place's settled position first.
    const placeTop = () => page.evaluate(() => document.querySelector('[data-sg="cta"]')!.getBoundingClientRect().top + scrollY);
    let home = await placeTop();
    for (let i = 0; i < 4; i++) {
      await scrollTo(page, home - height * 2.2, 400);
      await page.waitForTimeout(200);
      const settled = await placeTop();
      if (Math.abs(settled - home) < 1) break;
      home = settled;
    }
    // Well above its place, reading down: out of the way.
    await scrollTo(page, home - height * 2, 40);
    await expect(root).toHaveClass(/is-floating/);
    await expect(root).not.toHaveClass(/is-shown/);
    const pill = await root.locator("a").evaluate((element) => element.getBoundingClientRect().width);
    const centre = (width - pill) / 2;
    const placeLeft = await root.evaluate((element) => element.getBoundingClientRect().left);
    expect(centre - placeLeft).toBeGreaterThan(40);

    const stop = await recordPill(page);
    // Down, a hand's step at a time, until its place is well up the screen.
    await scrollTo(page, home - height * 0.4, 20);
    await page.waitForTimeout(800);
    let frames = await stop();
    // It came out to meet its place while still reading down.
    expect(frames.some((f) => f.floating && f.shown)).toBe(true);
    // It glided in: after it docked, frames between the centre and its place.
    const docked = frames.findIndex((f) => !f.floating);
    expect(docked).toBeGreaterThan(0);
    const landing = frames.slice(docked).filter((f) => f.left > placeLeft + 4 && f.left < centre - 4);
    expect(landing.length).toBeGreaterThan(4);
    // And it came to rest at its place.
    const last = frames[frames.length - 1];
    expect(last.floating).toBe(false);
    expect(Math.abs(last.left - placeLeft)).toBeLessThan(1);

    // Back up past its place: it leaves its place and glides out to the centre, shown, since reading up.
    const back = await recordPill(page);
    await scrollTo(page, home - height * 1.2, 20);
    await page.waitForTimeout(800);
    frames = await back();
    const undocked = frames.findIndex((f) => f.floating);
    expect(undocked).toBeGreaterThan(0);
    const leaving = frames.slice(undocked).filter((f) => f.left > placeLeft + 4 && f.left < centre - 4);
    expect(leaving.length).toBeGreaterThan(4);
    await expect(root).toHaveClass(/is-shown/);
    const end = frames[frames.length - 1];
    expect(Math.abs(end.left - centre)).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test("with reduced motion it shows and hides without sliding", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page);
    const root = page.locator('[data-sg="cta"]');
    const height = await viewport(page);
    await scrollTo(page, height * 1.8, 80);
    const stop = await recordPill(page);
    await scrollTo(page, height * 1.8 - 80, 20);
    await expect(root).toHaveClass(/is-shown/);
    await expect.poll(() => root.locator("a").evaluate((element) => Number(getComputedStyle(element).opacity)), { timeout: 4000 }).toBe(1);
    await scrollTo(page, height * 1.8 + 200, 20);
    await expect(root).not.toHaveClass(/is-shown/);
    await expect.poll(() => root.locator("a").evaluate((element) => Number(getComputedStyle(element).opacity)), { timeout: 4000 }).toBe(0);
    const frames = (await stop()).filter((f) => f.floating);
    expect(frames.length).toBeGreaterThan(3);
    // Always at the same place: it fades, it never slides.
    const tops = new Set(frames.map((f) => Math.round(f.top)));
    expect(tops.size).toBe(1);
    expect([...tops][0]).toBeLessThan(height);
  });

  test("nothing shifts while the cards stack and the pill leaves and finds its place", async ({ page }) => {
    await open(page);
    const height = await viewport(page);
    // Past the pinned sections higher up (their own tests cover them), with the pill out.
    await scrollTo(page, (await stackTop(page)) - height, 600);
    await page.waitForTimeout(600);
    await scrollTo(page, (await page.evaluate(() => scrollY)) - 100, 20);
    await expect(page.locator('[data-sg="cta"]')).toHaveClass(/is-shown/);
    await page.evaluate(() => {
      const shifts: number[] = [];
      (window as unknown as { sgShifts: number[] }).sgShifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) if (!entry.hadRecentInput) shifts.push(entry.value);
      }).observe({ type: "layout-shift" });
    });
    const home = await page.evaluate(() => document.querySelector('[data-sg="cta"]')!.getBoundingClientRect().top + scrollY);
    // Down through the stack to the link's place and the footer, then back up past its place.
    await scrollTo(page, home - height * 0.5, 60);
    await scrollTo(page, home + height, 60);
    await scrollTo(page, home - height * 2, 60);
    await page.waitForTimeout(300);
    const shifts = await page.evaluate(() => (window as unknown as { sgShifts: number[] }).sgShifts);
    expect(shifts.reduce((sum, value) => sum + value, 0)).toBeLessThan(0.001);
  });
});

test.describe("keyboard focus", () => {
  test("is never hidden under a later card or under the pill, tabbing down and back up, even with every card stacked", async ({ page }) => {
    const errors = collectErrors(page);
    await open(page);
    // Start at the stack's heading, as a keyboard user reading down would.
    await page.locator("#steps-title").evaluate((element) => {
      element.setAttribute("tabindex", "-1");
      element.focus();
    });
    const links = ["Visning ett, en idé hela vägen", "Labbets material, i 09", "Visning två, varm"];
    for (const name of links) {
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name })).toBeFocused();
      await expect.poll(() => unobscured(page), { timeout: 3000 }).toBe("ok");
    }
    // On to the call to action: shown (or at its place) and not covered.
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Se hantverket" })).toBeFocused();
    await expect.poll(() => unobscured(page), { timeout: 3000 }).toBe("ok");
    for (const name of [...links].reverse()) {
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("link", { name })).toBeFocused();
      await expect.poll(() => unobscured(page), { timeout: 3000 }).toBe("ok");
    }

    // Every card stacked, the last on top: tab back into each card beneath it.
    await page.evaluate(() => {
      const last = document.querySelectorAll<HTMLElement>(".stack-card")[3];
      const stuck = Number.parseFloat(getComputedStyle(last).top);
      window.scrollBy(0, last.getBoundingClientRect().top - stuck + 4);
    });
    await page.waitForTimeout(300);
    const stacked = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".stack-card")].map((card) => Math.round(card.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(card).top))));
    expect(stacked.every((offset) => Math.abs(offset) <= 6)).toBe(true);
    // Focus the pill without moving the page (it shows, since it has focus), then go back into the cards.
    await page.locator('[data-sg="cta"] a').evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    await expect(page.locator('[data-sg="cta"]')).toHaveClass(/is-shown|^(?!.*is-floating)/);
    for (const name of [...links].reverse()) {
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByRole("link", { name })).toBeFocused();
      await expect.poll(() => unobscured(page), { timeout: 3000 }).toBe("ok");
    }
    expect(errors).toEqual([]);
  });

  test("the pill shows when it gets focus, even while reading down", async ({ page }) => {
    await open(page);
    const height = await viewport(page);
    await scrollTo(page, height * 2, 80);
    const root = page.locator('[data-sg="cta"]');
    await expect(root).toHaveClass(/is-floating/);
    await expect(root).not.toHaveClass(/is-shown/);
    // The element before it in the page, focused without moving the page; then Tab, as a keyboard user does.
    await page.getByRole("link", { name: "Visning två, varm" }).evaluate((element) => (element as HTMLElement).focus({ preventScroll: true }));
    const before = await page.evaluate(() => scrollY);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Se hantverket" })).toBeFocused();
    // Unless the browser scrolled to the card's link, the page has not moved and the pill came to it.
    if (Math.abs((await page.evaluate(() => scrollY)) - before) < 2) await expect(root).toHaveClass(/is-shown/);
    await expect.poll(() => unobscured(page), { timeout: 3000 }).toBe("ok");
  });
});

for (const motion of ["no-preference", "reduce"] as const) {
  test(`no accessibility errors with the cards stacked and the pill showing (${motion === "reduce" ? "reduced motion" : "motion"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await open(page);
    const top = await stackTop(page);
    const height = await viewport(page);
    await scrollTo(page, top - height * 0.2, 300);
    await scrollTo(page, top + height * 1.2, 80);
    await scrollTo(page, top + height * 1.2 - 80, 20);
    await expect(page.locator('[data-sg="cta"]')).toHaveClass(/is-shown/);
    await page.waitForTimeout(700);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("on a phone nothing scrolls sideways, with the cards stacking and the pill out", async ({ page, isMobile }) => {
  test.skip(!isMobile, "The phone's narrow screen is the one that matters; the desktop run checks it in the tests above.");
  const errors = collectErrors(page);
  await open(page);
  const top = await stackTop(page);
  const height = await viewport(page);
  for (const at of [height * 1.5, top - height * 0.3, top + height * 0.6, top + height * 1.4, top + height * 2.2]) {
    await scrollTo(page, at, 200);
    await page.waitForTimeout(150);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  }
  await scrollTo(page, top + height * 2.2 - 80, 20);
  await expect(page.locator('[data-sg="cta"]')).toHaveClass(/is-shown/);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // The pill fits the screen with room on both sides.
  const box = (await page.locator('[data-sg="cta"] a').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8);
  expect(errors).toEqual([]);
});
