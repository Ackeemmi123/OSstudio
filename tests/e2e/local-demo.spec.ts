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

test("drafts a message to a client the studio is waiting on, without sending anything", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByText("Local demo")).toBeVisible();
  await page.clock.setSystemTime(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // A blocked task is the studio's own work: no message to draft.
  await page.goto("/clients");
  await page.getByRole("link", { name: /Ateljé Henrik/ }).first().click();
  await expect(page.locator("section#next").getByRole("link", { name: /Product data import template/ })).toContainText(/Blocked for/);
  await expect(page.locator("section#next").getByRole("button", { name: "Draft message" })).toHaveCount(0);

  // A lead whose brief was never started: draft the questions that are still open.
  await page.goto("/clients");
  await page.getByRole("link", { name: /Lumen Dental Studio/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Lumen Dental Studio" })).toBeVisible();
  await page.locator("section#next").getByRole("button", { name: "Draft message" }).click();
  const dialog = page.getByRole("dialog", { name: "Draft message" });
  await expect(dialog).toContainText("Nothing is sent from Studio OS.");
  await expect(dialog).toContainText("To: no email address recorded");
  await expect(dialog.getByLabel("Subject")).toHaveValue("A few questions before we start");
  await expect(dialog.getByLabel("Message")).toHaveValue(/^Hi there,[\s\S]*- Do you have a budget range in mind\?/);
  // Without an address there is nothing to open; the person copies the text instead.
  await expect(dialog.getByRole("link", { name: "Open in email" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Copy" })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toHaveCount(0);
});
