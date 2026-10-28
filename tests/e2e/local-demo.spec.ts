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

/** Follow-ups come from how long work has waited, so the test moves the browser's clock forward. */
test("work that has waited too long moves to Follow up, once", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByText("Local demo")).toBeVisible();
  // The demo's blocked task was blocked two days ago: not yet a follow-up.
  await expect(page.locator("section#follow-up")).toHaveCount(0);
  await expect(page.locator("section#next").getByRole("link", { name: /Product data import template/ })).toBeVisible();

  await page.clock.fastForward(3 * 24 * 60 * 60 * 1000);
  const followUp = page.locator("section#follow-up");
  const blocked = followUp.getByRole("link", { name: /Product data import template/ });
  await expect(blocked).toBeVisible();
  await expect(blocked).toContainText(/Blocked for 5 days/);
  await expect(blocked).toContainText("Unblock");
  // Shown once: no longer repeated under Next up.
  await expect(page.locator("section#next").getByRole("link", { name: /Product data import template/ })).toHaveCount(0);

  // The client's workspace leads with the same follow-up.
  await blocked.click();
  await expect(page.getByRole("heading", { level: 1, name: "Ateljé Henrik" })).toBeVisible();
  await expect(page.locator("section#next").getByRole("link", { name: /Product data import template/ })).toContainText(/Blocked for 5 days/);
});
