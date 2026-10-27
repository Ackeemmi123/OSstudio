import { expect, test } from "@playwright/test";
import { createClientNamed, uniqueName } from "./helpers";

/** The demo without a backend: clearly labeled, and saved only in this browser. */
test("the local demo says where data is kept and keeps it across a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Local demo")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toHaveCount(0);

  const name = uniqueName("Demo client");
  await createClientNamed(page, name);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  // Agents need the server; the demo says so instead of pretending.
  await expect(page.locator("section#analysis").getByRole("button", { name: "Analyze client information" })).toBeDisabled();
});
