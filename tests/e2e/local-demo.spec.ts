import { expect, test } from "@playwright/test";
import { createClientNamed, openSection, uniqueName } from "./helpers";

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
  await expect((await openSection(page, "analysis")).getByRole("button", { name: "Analyze client information" })).toBeDisabled();
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

test("the client page keeps its sections in tabs, and the address follows", async ({ page }) => {
  await page.goto("/clients/demo-atelje-henrik");
  const tabs = page.getByRole("navigation", { name: "Client sections" });
  await expect(tabs.getByRole("link", { name: /^Overview/ })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("section#next").getByText("Homepage design direction")).toBeVisible();
  await expect(page.getByTestId("brief-progress")).toContainText("answered");
  await expect(page.locator("section#brief")).toBeHidden();

  await tabs.getByRole("link", { name: /^Brief/ }).click();
  await expect(page).toHaveURL(/#brief$/);
  await expect(page.locator("section#brief")).toBeVisible();
  await expect(page.locator("section#next")).toBeHidden();
  await page.reload();
  await expect(page.locator("section#brief")).toBeVisible();

  await tabs.getByRole("link", { name: /^Activity/ }).click();
  await expect(page.locator("section#activity")).toBeVisible();
  await page.goBack();
  await expect(page.locator("section#brief")).toBeVisible();

  // A link to something inside a tab opens that tab.
  await page.goto("/");
  await page.locator("section#next").getByRole("link", { name: /Product page design/ }).click();
  await expect(page.locator("section#projects")).toBeVisible();
  await expect(page.locator('li[id^="task-"]', { hasText: "Product page design" })).toBeInViewport();

  // A form half-filled on one tab survives a look at another.
  await tabs.getByRole("link", { name: /^Projects/ }).click();
  await page.locator("section#projects").getByRole("button", { name: "New project" }).click();
  await page.locator("section#projects").getByLabel("Project name").fill("Kept while looking elsewhere");
  await tabs.getByRole("link", { name: /^Sources/ }).click();
  await tabs.getByRole("link", { name: /^Projects/ }).click();
  await expect(page.locator("section#projects").getByLabel("Project name")).toHaveValue("Kept while looking elsewhere");
});

test("approves a task from Today, and takes it back with Undo", async ({ page }) => {
  await page.goto("/");
  const decisions = page.locator("section#decisions");
  await decisions.getByRole("button", { name: "Approve" }).first().click();
  await expect(decisions.getByText("Homepage design direction")).toHaveCount(0);
  await expect(page.getByText("Approved Homepage design direction")).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(decisions.getByText("Homepage design direction")).toBeVisible();

  await page.goto("/clients/demo-atelje-henrik#activity");
  const activity = page.locator("section#activity");
  const showAll = activity.getByRole("button", { name: /Show all/ });
  if (await showAll.isVisible()) await showAll.click();
  await expect(activity.getByText("Approved Homepage design direction").first()).toBeVisible();
  await expect(activity.getByText("Homepage design direction moved to awaiting approval").first()).toBeVisible();
});

test("search finds tasks and opens them where they live, and offers a new client", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.getByRole("combobox", { name: "Search clients, projects and tasks" });
  await search.fill("product page");
  await expect(page.getByRole("option", { name: /Product page design/ })).toContainText("Ateljé Henrik");
  await search.press("Enter");
  await expect(page).toHaveURL(/#task-/);
  await expect(page.locator("section#projects")).toBeVisible();

  // On the same page, only the tab changes.
  await page.getByRole("navigation", { name: "Client sections" }).getByRole("link", { name: /^Overview/ }).click();
  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Search clients, projects and tasks" }).fill("product page");
  await page.getByRole("option", { name: /Product page design/ }).click();
  await expect(page.locator("section#projects")).toBeVisible();

  await page.keyboard.press("ControlOrMeta+k");
  await page.getByRole("combobox", { name: "Search clients, projects and tasks" }).fill("new client");
  await page.getByRole("option", { name: /New client/ }).click();
  await expect(page.getByRole("dialog", { name: "New client" })).toBeVisible();
});

test("the client page fits a phone without scrolling sideways", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto("/clients/demo-atelje-henrik");
  await expect(page.getByRole("navigation", { name: "Client sections" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
