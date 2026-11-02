import { test } from "@playwright/test";
import { loadProbe } from "./load-probe";

test("TEMPORARY load probe (zz)", async ({ page }) => {
  test.setTimeout(180_000);
  await loadProbe("zz", page);
});
