import { test } from "@playwright/test";
import { loadProbe } from "./load-probe";

test("TEMPORARY load probe (aa)", async ({ page }) => {
  test.setTimeout(180_000);
  await loadProbe("aa", page);
});
