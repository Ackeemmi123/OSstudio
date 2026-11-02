import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * The preview's templates, checked once for every website: every section type
 * in every layout, at phone and desktop width, with invented content. It needs
 * no server and no client data. What a person writes (alt texts, colours) is
 * checked in the editor.
 */
function drawnPages(): { id: string; html: string }[] {
  const file = path.join(test.info().outputDir, "preview-pages.json");
  execFileSync("npx", ["vitest", "run", "-c", "vitest.render.config.mts"], { env: { ...process.env, PREVIEW_PAGES_FILE: file }, stdio: "pipe" });
  return JSON.parse(readFileSync(file, "utf8")) as { id: string; html: string }[];
}

for (const [width, height, label] of [[1280, 800, "desktop"], [390, 800, "phone"]] as const) {
  test(`every section type passes the accessibility checks at ${label} width`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height });
    const problems: string[] = [];
    for (const { id, html } of drawnPages()) {
      await page.setContent(html);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      problems.push(...results.violations.map((v) => `${id}: ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`));
    }
    expect(problems).toEqual([]);
  });
}
